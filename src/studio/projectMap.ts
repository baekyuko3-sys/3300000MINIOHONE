export const MEME_PROJECT_MAP = `
小手机项目
├── APP
│   └── PhoneSimulator
├── HOME
│   ├── HomeScreen
│   ├── SaneHome
│   └── Settings
├── LINE
│   ├── Chats
│   ├── Friends
│   ├── VROOM
│   ├── Me
│   ├── Conversation
│   ├── Profile
│   └── Story
├── STORY
│   ├── OfflineStory
│   ├── Memory
│   ├── WorldBook
│   └── NPC
├── MEDIA
│   ├── Gallery
│   ├── Music
│   └── Notes
├── SYSTEM
│   ├── Store
│   ├── AI
│   ├── Persistence
│   └── Types
└── DEVELOPMENT
    └── Studio
        └── Meme
`.trim();

export const MEME_PROJECT_PRINCIPLES = [
  'Preserve existing functionality unless the user explicitly asks to remove it.',
  'Inspect related files before changing an existing feature.',
  'UI changes are real product changes and must be included in review.',
  'Stage changes in Studio Changes before applying them when approval mode requires it.',
  'The user can target main or another branch; never invent a hidden branch-only restriction.',
  'Prefer small, coherent changes and check for regressions after multi-file edits.',
];
