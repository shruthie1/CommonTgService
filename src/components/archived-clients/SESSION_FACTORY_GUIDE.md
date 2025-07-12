# Archived Client Session Factory Service

## Overview

The ArchivedClientService has been refactored into a production-grade session generation factory that provides reliable, active sessions for Telegram clients with comprehensive auditing, caching, and reliability features.

## Core Features

### 🏭 Session Factory
- **Always Active Sessions**: The service guarantees that `fetchOne()` always returns a valid, active session
- **Intelligent Session Management**: Automatically promotes backup sessions when primary sessions fail
- **Retry Logic**: Built-in retry mechanisms with exponential backoff for reliability
- **Timeout Protection**: Session generation operations have configurable timeouts

### 📊 Session Auditing & Tracking
- **Session History**: Complete audit trail of all session operations
- **Performance Metrics**: Track session reliability and health scores
- **Cache Statistics**: Monitor internal cache performance and hit rates
- **Detailed Logging**: Comprehensive logging for debugging and monitoring

### ⚡ Performance Optimizations
- **Session Validation Cache**: 5-minute TTL cache for session validation results
- **Batch Operations**: Support for bulk session operations (up to 50 mobiles)
- **Connection Pooling**: Efficient connection management with auto-cleanup
- **Smart Cleanup**: Automatic removal of expired cache entries

### 🔒 Production Reliability
- **Error Handling**: Comprehensive error handling with meaningful error messages
- **Resource Management**: Automatic connection cleanup and resource deallocation
- **Circuit Breaker Pattern**: Fail-fast for known bad sessions
- **Health Monitoring**: Built-in health check endpoints

## API Endpoints

### Core Session Factory
```typescript
GET /archived-clients/fetch/{mobile}
```
**Primary endpoint** - Always returns an active session for the mobile number. Creates new session if none exists or current session is inactive.

### Session Management
```typescript
PUT /archived-clients/{mobile}/session
POST /archived-clients/{mobile}/cleanup-sessions
GET /archived-clients/{mobile}/session-status
GET /archived-clients/{mobile}/old-sessions
```

### Batch Operations
```typescript
POST /archived-clients/batch-fetch
```
Process up to 50 mobile numbers in a single request.

### Health & Monitoring
```typescript
GET /archived-clients/health/cache-stats
GET /archived-clients/maintenance/check-archived-clients
```

## Usage Examples

### Basic Session Retrieval
```typescript
// Always get an active session
const client = await archivedClientService.fetchOne('916265240911');
// client.session will always be valid and active
```

### Batch Session Retrieval
```typescript
const mobiles = ['916265240911', '916265240912', '916265240913'];
const results = await archivedClientService.batchFetchSessions(mobiles);
// Process results with error handling
```

### Session Health Check
```typescript
const status = await archivedClientService.getSessionStatus('916265240911');
console.log(`Reliability: ${status.healthMetrics.reliability}`);
console.log(`Active backup sessions: ${status.healthMetrics.activeOldSessions}`);
```

### Manual Session Update
```typescript
const updatedClient = await archivedClientService.updateSession(
  '916265240911', 
  'new_session_token_here'
);
// Old session automatically backed up if still active
```

## Configuration

### Service Constants
```typescript
private readonly MAX_OLD_SESSIONS = 10;              // Max backup sessions per client
private readonly SESSION_GENERATION_TIMEOUT = 30000; // 30 second timeout
private readonly MAX_RETRY_ATTEMPTS = 3;             // Retry attempts for failures
private readonly CACHE_EXPIRY = 5 * 60 * 1000;      // 5 minute cache TTL
```

### Schema Enhancements
The ArchivedClient schema now includes:
- `lastUpdated`: Timestamp of last session update
- `lastCleanup`: Timestamp of last session cleanup
- `sessionHistory`: Audit trail of session operations
- `createdAt`/`updatedAt`: Automatic timestamps

## Production Considerations

### Monitoring
- Monitor cache hit rates (`GET /health/cache-stats`)
- Track session reliability scores
- Set up alerts for high error rates
- Monitor session generation timeouts

### Performance
- Cache cleanup runs automatically when size > 1000 entries
- Batch operations are limited to 50 mobiles per request
- Connection timeouts are set to 10 seconds for validation
- Session generation timeout is 30 seconds

### Error Handling
- All operations include comprehensive error handling
- Errors are logged with appropriate severity levels
- Failed operations include detailed error messages
- Circuit breaker pattern prevents cascading failures

### Scaling
- Service supports horizontal scaling through stateless design
- Cache is in-memory but could be externalized (Redis) for multi-instance deployments
- Database operations use atomic updates for consistency
- Connection pooling minimizes resource usage

## Migration Guide

### From Old Service
1. Replace direct `findOne()` calls with `fetchOne()` for guaranteed active sessions
2. Update error handling to use new exception types
3. Leverage new health monitoring endpoints
4. Consider using batch operations for bulk processing

### Database Migration
The enhanced schema is backward compatible. Existing records will work but won't have the new audit fields until they're updated.

## Best Practices

1. **Always use `fetchOne()`** for session retrieval - it guarantees active sessions
2. **Implement proper error handling** for all service calls
3. **Monitor session health** using the status endpoints
4. **Use batch operations** for bulk processing to improve efficiency
5. **Set up monitoring** for cache statistics and session reliability
6. **Regular cleanup** of old sessions using the cleanup endpoints

## Troubleshooting

### Common Issues
- **Session Generation Timeout**: Increase `SESSION_GENERATION_TIMEOUT` or check network connectivity
- **High Cache Misses**: Check if sessions are being invalidated too frequently
- **Low Reliability Scores**: Investigate Telegram connection stability
- **Memory Usage**: Monitor cache size and cleanup frequency

### Debug Endpoints
- `GET /health/cache-stats` - Cache performance metrics
- `GET /{mobile}/session-status` - Detailed session health
- `GET /maintenance/check-archived-clients` - Full system health check

This refactored service provides enterprise-grade session management with comprehensive monitoring, auditing, and reliability features suitable for production use.
