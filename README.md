# Reddit Q&A Self-Lock App

A comprehensive Devvit app for Reddit Q&A subreddits that enables original posters (OPs) to lock their own posts and mark them as answered, with full moderator configurability and extra moderation tools.

## Features

### OP Self-Lock & Flair
- **Configurable Triggers**: OPs can lock their posts using customizable trigger phrases (default: `!lock`, `/solved`)
- **Automatic Flair**: Posts are automatically flaired with a configurable "Answered" flair template
- **Sticky Comments**: A mod-distinguished sticky comment is added to indicate the post is closed
- **Context Support**: OPs can add context (e.g., `!lock Thanks for the help!`) which gets included in the sticky comment

### OP Hide Comment Tool
- **Comment Removal**: OPs can hide unwanted comments by replying with a trigger (default: `!hide`)
- **Clean Removal**: Both the original comment and the OP's trigger comment are removed

### Moderator Configuration
- **Trigger Customization**: Configure lock triggers, hide triggers, and message templates
- **Flair Integration**: Set the flair template ID for answered posts
- **Rate Limiting**: Prevent abuse with configurable cooldown periods
- **Action Logging**: Optional logging of all lock/hide actions for moderation review

### Moderation Tools
- **Force Lock**: Moderators can manually lock any post via menu action
- **Action Logs**: View recent app activity and user actions
- **Help System**: Built-in help guide for users and moderators

## Setup Instructions

1. **Install the App**: Upload this app to your subreddit
2. **Configure Settings**: Go to App Settings and configure:
   - Lock trigger phrases (comma-separated)
   - Hide comment trigger
   - Answered flair template ID
   - Sticky comment template
   - Rate limiting and logging preferences

3. **Set Up Flair**: Create a flair template for "Answered" posts and note its ID
4. **Test**: Create a test post and try the commands

## Usage

### For Original Posters
- **Lock your post**: Comment with `!lock` (or your configured trigger)
- **Add context**: `!lock Thanks everyone for the help!`
- **Hide comments**: Reply to unwanted comments with `!hide`

### For Moderators
- **Force lock posts**: Use the "Q&A: Force Lock Post" menu action
- **View logs**: Use "Q&A: View Action Log" to see recent activity
- **Get help**: Use "Q&A: Help & Commands" for a complete guide

## Security Features

- **Permission Checks**: Only OPs can lock their own posts
- **Rate Limiting**: Prevents spam with configurable cooldowns
- **Action Logging**: All actions are logged for audit trails
- **Error Handling**: Graceful error handling with user feedback

## Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| Lock Triggers | Comma-separated trigger phrases | `!lock, /solved` |
| Hide Trigger | Phrase to hide comments | `!hide` |
| Answered Flair ID | Flair template ID for answered posts | (empty) |
| Sticky Template | Template for sticky comments | Includes {context} placeholder |
| Enable Logging | Log all actions | `true` |
| Rate Limit | Minutes between actions | `2` |

## Technical Details

- Built with Devvit APIs for Reddit integration
- Uses Redis for rate limiting and action logging
- Handles comment submission events in real-time
- Provides moderator menu actions for manual control
- Includes comprehensive error handling and user feedback

## Support

For issues or feature requests, contact your subreddit moderators or the app developer.