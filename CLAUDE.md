# CLAUDE.md - AI Assistant Guide for AutoExport

## Project Overview

**AutoExport** is an automated data export system with a web monitoring interface. It automatically copies data from a source directory to a target directory, monitors disk space, logs all operations to SQLite, and provides a React-based dashboard for system monitoring.

**Tech Stack:**
- **Runtime:** Bun (>= 1.3.2) - single runtime for frontend and backend
- **Frontend:** React 19, Radix UI, Tailwind CSS 4
- **Backend:** Bun's native HTTP server with Express-like routing
- **Database:** SQLite with WAL mode
- **File Operations:** rsync
- **Task Scheduling:** Croner library

## Directory Structure

```
/
├── src/                        # Frontend (React)
│   ├── components/             # React components
│   │   ├── Dashboard.tsx       # Main dashboard with data fetching
│   │   ├── DiskUsageCard.tsx   # Disk usage visualization
│   │   ├── SettingsDialog.tsx  # Settings modal
│   │   ├── *LogsTab.tsx        # Log display components
│   │   └── ui/                 # Radix UI-based components (Shadcn)
│   ├── styles/                 # CSS files (Tailwind)
│   ├── utils/                  # Frontend utilities
│   ├── lib/                    # Shared utilities (class merge)
│   ├── types.ts                # TypeScript interfaces
│   ├── App.tsx                 # Root component
│   └── main.tsx                # React entry point
│
├── server/                     # Backend
│   ├── libs/                   # Core libraries
│   │   ├── config.ts           # Config file handling
│   │   ├── db.ts               # SQLite database setup
│   │   └── copy.ts             # rsync wrapper
│   ├── services/               # Business logic
│   │   ├── config.service.ts   # Config validation & updates
│   │   ├── copy.service.ts     # Copy directory logic
│   │   ├── delete.service.ts   # Delete & space control
│   │   └── cleanup.service.ts  # Old log cleanup
│   ├── utils/                  # Backend utilities
│   │   ├── utils.ts            # Disk usage, date helpers
│   │   ├── securityUtils.ts    # Path validation
│   │   └── delete.ts           # Directory deletion
│   ├── index.ts                # Main server entry + API routes
│   └── copy_all.ts             # CLI utility for bulk copying
│
├── public/                     # Static files
│   └── index.html              # HTML template
│
├── Dockerfile                  # Docker image definition
├── docker-compose.yml          # Service orchestration
├── package.json                # Dependencies & scripts
├── tsconfig.json               # TypeScript configuration
├── bunfig.toml                 # Bun configuration
├── build.ts                    # Custom build script
└── mount-network.sh            # NFS/SMB/SSHFS mount setup
```

## Development Commands

```bash
# Development with hot reload
bun dev

# Production server
bun start

# Build for production
bun run build

# Bulk copy all directories (CLI utility)
bun run copy-all

# Docker deployment
docker-compose up -d --build
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/config` | GET | Retrieve current configuration |
| `/api/config` | POST | Update configuration |
| `/api/space` | GET | Get disk usage for src/dest |
| `/api/copy` | GET | Get copy operation logs |
| `/api/delete` | GET | Get delete operation logs |
| `/api/errors` | GET | Get error logs |
| `/api/dirs` | GET | List directories in path |
| `/api/health` | GET | Health check |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SRC_PATH` | `/tmp/src` | Source directory for copying |
| `DEST_PATH` | `/tmp/dest` | Destination directory |
| `DISK_LIMIT` | `78` | Disk usage threshold (%) |
| `CLEANUP_DAYS` | `90` | Logs retention period (days) |
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | `3001` | Server port |

## Code Conventions

### Backend (TypeScript/Bun)

- **Error Handling:** Always use try-catch with JSON error responses
- **Response Format:** Return JSON with `error` field on failure (500/400 status)
- **Path Validation:** Use `validateAndNormalizePath()` from `securityUtils.ts` for all user-provided paths
- **Database:** Use prepared statements, WAL mode enabled by default
- **Date Format:** ISO 8601 strings (`toISOString()`) in database
- **Directory Format:** YYYYMMDD pattern (8 digits) - validated with `/^\d{8}$/`
- **Async Operations:** Use `Promise.all()` for parallel tasks

### Frontend (React/TypeScript)

- **Components:** Functional components with hooks only
- **API Calls:** Use `fetchAPI<T>()` generic wrapper from `utils/api.ts`
- **Styling:** Tailwind CSS classes, avoid inline styles
- **UI Components:** Use Shadcn/Radix UI components from `components/ui/`
- **Types:** Define shared types in `types.ts`
- **Theme:** Light/dark/system with localStorage persistence

### File Organization

- **libs/** - Core initialization logic (config, db, copy wrapper)
- **services/** - Business logic, one service per domain
- **utils/** - Pure helper functions
- Each service should handle one domain (copy, delete, cleanup, config)

## Database Schema

```sql
-- CopyLog: Records of copy operations
CREATE TABLE CopyLog (
  id TEXT PRIMARY KEY,
  createdAt TEXT,
  copiedDir TEXT,
  filesCopied INTEGER,
  totalTime INTEGER,  -- milliseconds
  bytesCopied TEXT
);

-- DeleteLog: Records of delete operations
CREATE TABLE DeleteLog (
  id TEXT PRIMARY KEY,
  createdAt TEXT,
  deletedDir TEXT,
  totalTime INTEGER,  -- milliseconds
  percentageAfterDelete INTEGER
);

-- ErrorLog: Error records
CREATE TABLE ErrorLog (
  id TEXT PRIMARY KEY,
  createdAt TEXT,
  errorMsg TEXT,
  targetDir TEXT
);
```

All tables have indexes on `createdAt` for query performance.

## Cron Job Schedules

| Time | Task | Purpose |
|------|------|---------|
| `0 * * * *` | Copy current day directory | Hourly incremental sync |
| `0 22 * * *` | Copy yesterday's directory | Daily completion backup |
| `0 3 * * *` | Source disk space control | Delete oldest dirs if over limit |
| `0 4 * * *` | Destination disk space control | Same for target |
| `0 5 * * *` | Cleanup old logs | Delete logs older than cleanupDays |
| `0 6 * * *` | Delete redundant directories | Remove non-YYYYMMDD dirs |

## Important Patterns

### Adding a New API Endpoint

Add routes in `server/index.ts`:

```typescript
if (pathname === '/api/newEndpoint' && method === 'GET') {
  try {
    const data = await someService.getData();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

### Adding a New Service

Create in `server/services/`:

```typescript
// server/services/newFeature.service.ts
import { db } from '../libs/db';

export async function performAction() {
  // Business logic here
}
```

### Adding a New UI Component

1. Create component in `src/components/`
2. Use Shadcn components from `src/components/ui/`
3. Follow existing patterns (Dashboard.tsx is a good reference)

## Security Considerations

- **Path Validation:** All paths must be absolute and exist as directories
- **No directory traversal:** `validateAndNormalizePath()` prevents `../` attacks
- **rsync:** Uses `--delete` flag - be careful with source/destination paths
- **Config updates:** Validated before persisting

## Docker Deployment Notes

- Build: `docker-compose up -d --build`
- Volumes persist config.json, database, and WAL files
- Health check available at `/api/health`
- Mount network shares before starting (see `mount-network.sh`)
- Default port: 3001 (configurable via PORT env var)

## Testing Changes

1. Run `bun dev` for development with hot reload
2. Access dashboard at `http://localhost:3001`
3. Check `/api/health` for server status
4. Monitor console for cron job logs
5. Check database tables for operation logs

## Common Issues

- **rsync not found:** Install rsync (`apt-get install rsync`)
- **Permission denied:** Check mount permissions for src/dest paths
- **Database locked:** Ensure WAL files are properly mounted in Docker
- **Cron jobs not running:** Check timezone settings (Moscow TZ for disk control)
