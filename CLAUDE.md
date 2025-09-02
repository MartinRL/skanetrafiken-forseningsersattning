# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a browser extension for Skånetrafiken that automatically detects cancelled rides with delays of 20+ minutes and adds compensation buttons to help users claim delay compensation.

## Architecture

### Core Components

**manifest.json**: Chrome extension manifest v3 configuration
- Content script injection on `https://www.skanetrafiken.se/*`
- No background scripts or service workers
- Runs at `document_idle` for optimal performance

**content.js**: Main logic (154 lines)
- Journey detection via `[class*="st-journey"]` selectors
- Cancellation identification through `.st-journey--is-canceled` class or "Inställd" text
- Time extraction using regex: `/Ankom(?:mer)?:\s*(\d{2}:\d{2})/`
- Delay calculation with cross-day boundary handling
- MutationObserver for dynamic content updates
- Button injection only for delays ≥20 minutes

**styles.css**: Button styling
- Red compensation button (#ff6b6b) with hover effects
- Responsive design breakpoint at 768px
- Integrated layout for cancelled journey containers

## Key Implementation Details

### Time Calculation Logic
- Times parsed as minutes since midnight (HH:MM → total minutes)
- Next-day arrivals handled by adding 24*60 minutes when delay is negative
- Skips consecutive cancelled journeys when finding next available ride

### DOM Manipulation Strategy
- Buttons appended to journey elements in dedicated container div
- Duplicate prevention via `.delay-compensation-btn` selector check
- Event propagation stopped on button clicks to prevent journey expansion

### Current Limitations
- Alert placeholder for compensation claims (line 106 in content.js) - needs integration with actual compensation system
- No persistent storage of identified delays
- No tracking of submitted compensation claims

## Development Commands

No build process required - this is a pure JavaScript/CSS extension. To test:

1. Open Chrome/Edge browser
2. Navigate to `chrome://extensions/` or `edge://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select this directory
5. Visit https://www.skanetrafiken.se and search for cancelled journeys

## Testing Approach

Manual testing on Skånetrafiken website:
- Search for routes with known cancellations
- Verify button appears only for 20+ minute delays
- Test cross-day boundary scenarios (late night cancellations)
- Verify MutationObserver catches dynamically loaded content
- Check responsive design on mobile viewports

## Git Commit Convention

This project follows **Conventional Commits** specification. All commits must use this format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

- **feat**: New feature or functionality
- **fix**: Bug fix
- **docs**: Documentation changes only
- **style**: Code style changes (formatting, semicolons, etc.)
- **refactor**: Code changes that neither fix bugs nor add features
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **build**: Changes to build system or dependencies
- **ci**: CI/CD configuration changes
- **chore**: Other changes that don't modify src or test files
- **revert**: Reverts a previous commit

### Examples

```bash
# Feature
feat: add automatic delay detection for multiple cancelled journeys
feat(button): implement compensation amount display

# Bug fix
fix: correct time calculation for cross-day boundaries
fix(parser): handle "Ankommer" text variation in arrival times

# Breaking change (triggers major version bump)
feat!: change minimum delay threshold from 20 to 30 minutes
BREAKING CHANGE: Users will now only see compensation buttons for 30+ minute delays

# Documentation
docs: add installation instructions for Firefox

# Refactor
refactor: extract time parsing logic into separate functions

# Style
style: format CSS with consistent indentation
```

### Scope Guidelines

Use these scopes when relevant:
- **button**: Compensation button UI/UX
- **parser**: Time/text extraction logic
- **detector**: Journey cancellation detection
- **styles**: CSS styling
- **manifest**: Extension configuration

### Important Rules

- Keep the description in imperative mood ("add" not "added")
- Don't capitalize first letter of description
- No period at the end of description
- Breaking changes must include `!` after type/scope OR have `BREAKING CHANGE:` in footer
- Body and footer are optional but recommended for complex changes