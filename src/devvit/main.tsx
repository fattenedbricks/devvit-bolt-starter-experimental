import { Devvit, Context } from '@devvit/public-api';

// Configuration settings for moderators
const settings = Devvit.addSettings([
  {
    type: 'string',
    name: 'lockTriggers',
    label: 'Lock Triggers (comma-separated)',
    helpText: 'Phrases that trigger post locking when used by OP (e.g., !lock, /solved)',
    defaultValue: '!lock, /solved',
  },
  {
    type: 'string',
    name: 'hideTrigger',
    label: 'Hide Comment Trigger',
    helpText: 'Phrase that triggers comment hiding when used by OP',
    defaultValue: '!hide',
  },
  {
    type: 'string',
    name: 'answeredFlairId',
    label: 'Answered Flair Template ID',
    helpText: 'The flair template ID to apply when post is marked as answered',
    defaultValue: '',
  },
  {
    type: 'string',
    name: 'stickyTemplate',
    label: 'Default Sticky Comment Template',
    helpText: 'Template for the sticky comment. Use {context} for OP\'s additional text',
    defaultValue: '🔒 **Post Locked by OP** - This question has been marked as answered.{context}',
  },
  {
    type: 'boolean',
    name: 'enableLogging',
    label: 'Enable Action Logging',
    helpText: 'Log all lock/hide actions for moderation review',
    defaultValue: true,
  },
  {
    type: 'number',
    name: 'rateLimitMinutes',
    label: 'Rate Limit (minutes)',
    helpText: 'Minimum time between actions by the same user',
    defaultValue: 2,
  },
]);

// Rate limiting storage
const RATE_LIMIT_KEY = (userId: string) => `ratelimit:${userId}`;
const ACTION_LOG_KEY = (subredditId: string) => `actionlog:${subredditId}`;

// Helper function to parse triggers
function parseTriggers(triggerString: string): string[] {
  return triggerString.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
}

// Helper function to check rate limiting
async function checkRateLimit(context: Context, userId: string): Promise<boolean> {
  const rateLimitMinutes = await context.settings.get('rateLimitMinutes') as number;
  const key = RATE_LIMIT_KEY(userId);
  const lastAction = await context.redis.get(key);
  
  if (lastAction) {
    const timeDiff = Date.now() - parseInt(lastAction);
    const minutesDiff = timeDiff / (1000 * 60);
    if (minutesDiff < rateLimitMinutes) {
      return false;
    }
  }
  
  await context.redis.setex(key, rateLimitMinutes * 60, Date.now().toString());
  return true;
}

// Helper function to log actions
async function logAction(context: Context, action: string, details: any): Promise<void> {
  const enableLogging = await context.settings.get('enableLogging') as boolean;
  if (!enableLogging) return;

  const subreddit = await context.reddit.getCurrentSubreddit();
  const logKey = ACTION_LOG_KEY(subreddit.id);
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    action,
    details,
  };
  
  // Store last 100 log entries
  const existingLogs = await context.redis.get(logKey);
  const logs = existingLogs ? JSON.parse(existingLogs) : [];
  logs.unshift(logEntry);
  if (logs.length > 100) logs.splice(100);
  
  await context.redis.set(logKey, JSON.stringify(logs));
}

// Helper function to extract context from trigger comment
function extractContext(commentBody: string, trigger: string): string {
  const triggerIndex = commentBody.toLowerCase().indexOf(trigger.toLowerCase());
  if (triggerIndex === -1) return '';
  
  const afterTrigger = commentBody.substring(triggerIndex + trigger.length).trim();
  return afterTrigger ? ` - ${afterTrigger}` : '';
}

// Main comment handler
Devvit.addTrigger({
  event: 'CommentSubmit',
  onEvent: async (event, context) => {
    try {
      const comment = await context.reddit.getCommentById(event.commentId);
      const post = await context.reddit.getPostById(comment.postId);
      const commentAuthor = await context.reddit.getUserById(comment.authorId);
      const postAuthor = await context.reddit.getUserById(post.authorId);
      
      // Only process comments by the original poster
      if (comment.authorId !== post.authorId) return;
      
      const commentBody = comment.body?.toLowerCase() || '';
      
      // Get settings
      const lockTriggersStr = await context.settings.get('lockTriggers') as string;
      const hideTrigger = (await context.settings.get('hideTrigger') as string).toLowerCase();
      const lockTriggers = parseTriggers(lockTriggersStr);
      
      // Check for lock triggers
      const matchedLockTrigger = lockTriggers.find(trigger => 
        commentBody.includes(trigger.toLowerCase())
      );
      
      if (matchedLockTrigger) {
        // Check rate limiting
        if (!await checkRateLimit(context, comment.authorId)) {
          await context.reddit.reply(comment, 
            '⚠️ Please wait before using this command again.'
          );
          return;
        }
        
        await handlePostLock(context, post, comment, matchedLockTrigger);
        return;
      }
      
      // Check for hide trigger on reply comments
      if (commentBody.includes(hideTrigger) && comment.parentId) {
        // Check rate limiting
        if (!await checkRateLimit(context, comment.authorId)) {
          await context.reddit.reply(comment, 
            '⚠️ Please wait before using this command again.'
          );
          return;
        }
        
        await handleCommentHide(context, comment);
        return;
      }
      
    } catch (error) {
      console.error('Error processing comment:', error);
    }
  },
});

// Handle post locking
async function handlePostLock(context: Context, post: any, triggerComment: any, trigger: string): Promise<void> {
  try {
    // Extract context from the trigger comment
    const contextText = extractContext(triggerComment.body || '', trigger);
    
    // Lock the post
    await post.lock();
    
    // Apply flair if configured
    const flairId = await context.settings.get('answeredFlairId') as string;
    if (flairId) {
      try {
        await post.setFlair({
          flairTemplateId: flairId,
        });
      } catch (error) {
        console.error('Error setting flair:', error);
      }
    }
    
    // Create and sticky the mod comment
    const stickyTemplate = await context.settings.get('stickyTemplate') as string;
    const stickyText = stickyTemplate.replace('{context}', contextText);
    
    const stickyComment = await context.reddit.submitComment({
      id: post.id,
      text: stickyText,
    });
    
    // Distinguish and sticky the comment
    await stickyComment.distinguish(true);
    await stickyComment.sticky();
    
    // Remove the trigger comment
    await triggerComment.remove();
    
    // Log the action
    await logAction(context, 'POST_LOCKED', {
      postId: post.id,
      postTitle: post.title,
      authorId: triggerComment.authorId,
      trigger,
      context: contextText,
    });
    
  } catch (error) {
    console.error('Error handling post lock:', error);
    await context.reddit.reply(triggerComment, 
      '❌ Error locking post. Please contact moderators.'
    );
  }
}

// Handle comment hiding
async function handleCommentHide(context: Context, triggerComment: any): Promise<void> {
  try {
    if (!triggerComment.parentId) return;
    
    // Get the parent comment
    const parentComment = await context.reddit.getCommentById(triggerComment.parentId);
    
    // Remove both comments
    await parentComment.remove();
    await triggerComment.remove();
    
    // Log the action
    await logAction(context, 'COMMENT_HIDDEN', {
      postId: triggerComment.postId,
      parentCommentId: triggerComment.parentId,
      triggerCommentId: triggerComment.id,
      authorId: triggerComment.authorId,
    });
    
  } catch (error) {
    console.error('Error handling comment hide:', error);
  }
}

// Moderator menu actions
Devvit.addMenuItem({
  label: 'Q&A: Force Lock Post',
  location: 'post',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    try {
      const post = await context.reddit.getPostById(event.targetId);
      
      // Lock the post
      await post.lock();
      
      // Apply flair if configured
      const flairId = await context.settings.get('answeredFlairId') as string;
      if (flairId) {
        try {
          await post.setFlair({
            flairTemplateId: flairId,
          });
        } catch (error) {
          console.error('Error setting flair:', error);
        }
      }
      
      // Create sticky comment
      const stickyText = '🔒 **Post Locked by Moderator** - This question has been marked as answered.';
      const stickyComment = await context.reddit.submitComment({
        id: post.id,
        text: stickyText,
      });
      
      await stickyComment.distinguish(true);
      await stickyComment.sticky();
      
      // Log the action
      await logAction(context, 'MOD_FORCE_LOCK', {
        postId: post.id,
        postTitle: post.title,
        moderatorId: context.userId,
      });
      
      context.ui.showToast('Post locked successfully!');
      
    } catch (error) {
      console.error('Error force locking post:', error);
      context.ui.showToast('Error locking post. Please try again.');
    }
  },
});

Devvit.addMenuItem({
  label: 'Q&A: View Action Log',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    try {
      const subreddit = await context.reddit.getCurrentSubreddit();
      const logKey = ACTION_LOG_KEY(subreddit.id);
      const logsData = await context.redis.get(logKey);
      
      if (!logsData) {
        context.ui.showToast('No actions logged yet.');
        return;
      }
      
      const logs = JSON.parse(logsData);
      const recentLogs = logs.slice(0, 10); // Show last 10 actions
      
      let logText = '# Q&A App Action Log (Last 10 Actions)\n\n';
      
      for (const log of recentLogs) {
        logText += `**${log.action}** - ${log.timestamp}\n`;
        logText += `Details: ${JSON.stringify(log.details, null, 2)}\n\n`;
      }
      
      // Create a temporary post with the log
      const logPost = await context.reddit.submitPost({
        title: `Q&A App Action Log - ${new Date().toISOString()}`,
        text: logText,
        subredditName: subreddit.name,
      });
      
      context.ui.showToast('Action log created as a post!');
      context.ui.navigateTo(logPost.url);
      
    } catch (error) {
      console.error('Error viewing action log:', error);
      context.ui.showToast('Error retrieving action log.');
    }
  },
});

// Help menu item
Devvit.addMenuItem({
  label: 'Q&A: Help & Commands',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    const lockTriggersStr = await context.settings.get('lockTriggers') as string;
    const hideTrigger = await context.settings.get('hideTrigger') as string;
    
    const helpText = `# Q&A App Help

## For Original Posters (OPs):

**Lock Your Post:**
- Comment with any of these triggers: ${lockTriggersStr}
- Add optional context: \`!lock Thanks for the help!\`
- Your post will be locked and marked as answered

**Hide Comments:**
- Reply to any comment with: \`${hideTrigger}\`
- Both the original comment and your reply will be removed

## For Moderators:

**Settings:**
- Configure triggers, flair templates, and messages in App Settings
- Enable/disable action logging
- Set rate limiting

**Menu Actions:**
- Force lock any post
- View action logs
- Access this help

## Rate Limiting:
- Users can only use commands every few minutes (configurable)
- Prevents spam and abuse

## Logging:
- All actions are logged for moderation review
- Logs include timestamps, user IDs, and action details`;

    const subreddit = await context.reddit.getCurrentSubreddit();
    const helpPost = await context.reddit.submitPost({
      title: 'Q&A App - Help & Commands',
      text: helpText,
      subredditName: subreddit.name,
    });
    
    context.ui.showToast('Help guide created!');
    context.ui.navigateTo(helpPost.url);
  },
});

export default Devvit;