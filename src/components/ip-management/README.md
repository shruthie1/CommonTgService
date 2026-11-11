# IP Management System

A comprehensive IP management system for assigning dedicated proxy IPs to client mobile numbers with automatic assignment and global IP mapping functionality.

## Overview

This system provides:
- **Dedicated IP Pool Management**: Each client can have a dedicated pool of proxy IPs
- **Global IP Mapping**: Global collection of IP-to-mobile mappings 
- **Smart IP Assignment**: Automatic IP assignment with fallback logic
- **Mobile Number Integration**: Seamless integration with existing client mobile/promote mobile numbers
- **Comprehensive API**: Full REST API for managing IPs and mappings

## Architecture

### Core Components

1. **ProxyIp Schema**: Stores proxy IP information with authentication details
2. **IpMobileMapping Schema**: Maps mobile numbers to IP addresses
3. **IpManagementService**: Core IP and mapping management
4. **ClientIpIntegrationService**: Integration with existing client system
5. **Controllers**: REST API endpoints for all operations

### Flow Diagram

```
Mobile Number Request → Check Global Mapping → Found? Return IP
                                ↓
                              Not Found → Check Client Pool → Available IP? Assign & Return
                                ↓
                              No Available IP → Return null/error
```

## Database Schemas

### ProxyIp Collection
```typescript
{
  ipAddress: string;        // IP address (e.g., "192.168.1.100")
  port: number;            // Port number (e.g., 8080)
  protocol: string;        // "http" | "https" | "socks5"
  username?: string;       // Proxy authentication username
  password?: string;       // Proxy authentication password
  country?: string;        // Country code (e.g., "US")
  city?: string;          // City name
  provider?: string;       // Provider/datacenter name
  status: string;         // "active" | "inactive" | "blocked" | "maintenance"
  isAssigned: boolean;    // Whether IP is currently assigned
  assignedToClient?: string; // Client ID that owns this IP
  lastUsed?: Date;        // Last usage timestamp
  responseTime?: number;  // Response time in ms
  uptime?: number;        // Uptime percentage
  notes?: string;         // Additional notes
}
```

### IpMobileMapping Collection
```typescript
{
  mobile: string;           // Mobile number (unique)
  ipAddress: string;        // IP:port combination
  clientId: string;         // Client ID that owns the mobile
  mobileType: string;       // "main" | "promote"
  status: string;           // "active" | "inactive" | "temporary"
  lastUsed?: Date;         // Last usage timestamp
  expiresAt?: Date;        // Expiration date for temporary mappings
  priority: number;        // Priority level (0 = highest)
  assignmentReason?: string; // Reason for assignment
}
```

### Client Schema
The client schema has no IP fields. `dedicatedIps`, `preferredIpCountry` and `autoAssignIps` were removed on 2026-11-11. Old values stay in stored documents but nothing reads them.

## API Endpoints

### Core IP Management

#### Proxy IP Management
- `POST /ip-management/proxy-ips` - Create new proxy IP
- `POST /ip-management/proxy-ips/bulk` - Bulk create proxy IPs  
- `GET /ip-management/proxy-ips` - Get all proxy IPs
- `GET /ip-management/proxy-ips/search` - Search proxy IPs with filters
- `GET /ip-management/proxy-ips/:ip/:port` - Get specific proxy IP
- `PUT /ip-management/proxy-ips/:ip/:port` - Update proxy IP
- `DELETE /ip-management/proxy-ips/:ip/:port` - Delete proxy IP

#### IP-Mobile Mapping
- `GET /ip-management/mappings` - Get all mappings
- `GET /ip-management/mappings/search` - Search mappings with filters
- `POST /ip-management/mappings` - Create new mapping
- `GET /ip-management/mappings/mobile/:mobile/ip` - Get IP for mobile

#### IP Assignment Operations
- `POST /ip-management/assign` - Assign IP to mobile
- `POST /ip-management/assign/bulk` - Bulk assign IPs
- `DELETE /ip-management/assign/mobile/:mobile` - Release IP from mobile

#### Client-Specific Operations
- `GET /ip-management/clients/:clientId/ips` - Get client's dedicated IPs
- `GET /ip-management/clients/:clientId/mappings` - Get client's mappings
- `POST /ip-management/clients/:clientId/assign-dedicated` - Assign dedicated IPs to client

### Statistics & Maintenance
- `GET /ip-management/statistics` - Get system statistics
- `POST /ip-management/maintenance/cleanup-expired` - Clean up expired mappings

## Usage Examples

### 1. Setup Proxy IPs

```javascript
// Create a single proxy IP
const response = await fetch('/ip-management/proxy-ips', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ipAddress: '192.168.1.100',
    port: 8080,
    protocol: 'http',
    username: 'proxyuser',
    password: 'proxypass',
    country: 'US',
    city: 'New York',
    provider: 'DataCenter1'
  })
});

// Bulk create proxy IPs
const bulkResponse = await fetch('/ip-management/proxy-ips/bulk', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify([
    { ipAddress: '192.168.1.100', port: 8080, protocol: 'http', country: 'US' },
    { ipAddress: '192.168.1.101', port: 8080, protocol: 'http', country: 'US' },
    { ipAddress: '10.0.0.100', port: 3128, protocol: 'https', country: 'UK' }
  ])
});
```

### 2. Manual IP Assignment

```javascript
// Manually assign IP to specific mobile
const assignResponse = await fetch('/ip-management/assign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mobile: '916265240911',
    clientId: 'shruthi1',
    mobileType: 'main',
    preferredCountry: 'US',
    assignmentReason: 'Manual assignment for testing'
  })
});
```

## Integration with Existing Code

### Client Service Integration

The IP management system integrates seamlessly with your existing client management:

```typescript
// When updating a client's mobile number
await clientService.update(clientId, { mobile: newMobile });
// IP is automatically reassigned via integration service

// When adding promote mobiles
await clientService.addPromoteMobile(clientId, newPromoteMobile);
// Assign its IP through the ip-management endpoints

// Get IP for any mobile operation
const ip = await clientService.getIpForMobile(mobile, clientId);
if (ip) {
  // Use the IP for Telegram operations
  await telegramService.connectWithProxy(mobile, ip);
}
```

### Telegram Integration Example

```typescript
// In your Telegram service, get IP before connecting
async function connectWithMobileIp(mobile: string, clientId?: string) {
  const ip = await clientIpIntegrationService.getIpForMobile(mobile, clientId);
  
  if (ip) {
    const [ipAddress, port] = ip.split(':');
    // Configure Telegram client with proxy
    const telegramClient = new TelegramClient({
      // ... other config
      proxy: {
        ip: ipAddress,
        port: parseInt(port),
        socksType: 5  // or http proxy
      }
    });
    
    await telegramClient.connect();
  } else {
    // Connect without proxy or handle error
    console.warn(`No IP assigned to mobile ${mobile}`);
  }
}
```

## Configuration

### Environment Variables

Add these to your environment configuration:

```env
# IP Management Settings
AUTO_ASSIGN_IPS=true
DEFAULT_IP_COUNTRY=US
IP_ASSIGNMENT_TIMEOUT=30000
MAX_IPS_PER_CLIENT=10
ENABLE_IP_HEALTH_CHECK=true
```

### Client Configuration

No per-client setup is needed. The client IP fields were removed on 2026-11-11.

## Monitoring & Maintenance

### Statistics

Get system-wide statistics:

```javascript
const stats = await fetch('/ip-management/statistics').then(r => r.json());
console.log(`
Total IPs: ${stats.totalIps}
Active IPs: ${stats.activeIps}
Assigned IPs: ${stats.assignedIps}
Available IPs: ${stats.availableIps}
Active Mappings: ${stats.activeMappings}
By Country: ${JSON.stringify(stats.byCountry)}
`);
```

### Cleanup Operations

```javascript
// Cleanup expired mappings
const cleanupResult = await fetch('/ip-management/maintenance/cleanup-expired', {
  method: 'POST'
}).then(r => r.json());

console.log(`Cleaned up ${cleanupResult.cleanedCount} expired mappings`);
```

### Health Checks

The system includes automatic health monitoring:
- IP response time tracking
- Uptime monitoring
- Assignment success rates
- Automatic cleanup of expired mappings

## Best Practices

1. **IP Pool Management**
   - Maintain at least 20% spare IPs in each geographic region
   - Regularly rotate IPs to avoid blocking
   - Monitor IP health and replace unhealthy IPs

2. **Client Assignment Strategy**
   - Use dedicated IP pools for high-priority clients
   - Assign IPs based on geographic requirements
   - Enable auto-assignment for seamless operation

3. **Monitoring**
   - Set up alerts for low IP availability
   - Monitor assignment failure rates
   - Track IP performance metrics

4. **Security**
   - Store proxy credentials securely
   - Regularly update proxy passwords
   - Use different credentials for different IP pools

## Troubleshooting

### Common Issues

1. **No IPs Available**
   - Check IP status: `GET /ip-management/proxy-ips/search?status=active&isAssigned=false`
   - Add more IPs to the pool
   - Check client-specific IP assignments

2. **Assignment Failures**
   - Verify client exists
   - Check IP pool has available IPs in preferred country
   - Review assignment logs for error details

3. **Mobile Not Getting IP**
   - Check global mapping: `GET /ip-management/mappings/mobile/{mobile}/ip`
   - Verify client has dedicated IPs or available pool IPs
   - Check if mobile type (main/promote) is correctly set

### Debug Commands

```bash
# Check IP statistics
curl -X GET http://localhost:3000/ip-management/statistics

# Search for available IPs
curl -X GET "http://localhost:3000/ip-management/proxy-ips/search?status=active&isAssigned=false"

# Check client mappings
curl -X GET http://localhost:3000/ip-management/clients/{clientId}/mappings

# Get mobile IP with debug info
curl -X GET "http://localhost:3000/clients/mobile/{mobile}/ip?clientId={clientId}"
```

## Migration Guide

If you have existing IP management, follow these steps:

1. **Export Existing Data**
   ```javascript
   // Export your current IP data to the new format
   const existingIps = await getCurrentIpData();
   const formattedIps = existingIps.map(ip => ({
     ipAddress: ip.host,
     port: ip.port,
     protocol: 'http',
     username: ip.username,
     password: ip.password,
     status: 'active'
   }));
   ```

2. **Import to New System**
   ```javascript
   await fetch('/ip-management/proxy-ips/bulk', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(formattedIps)
   });
   ```

3. **Update Client Configuration**
   No step. Clients have no IP fields since 2026-11-11.

4. **Migrate Existing Assignments**
   ```javascript
   // If you have existing mobile-IP mappings
   const existingMappings = await getExistingMappings();
   for (const mapping of existingMappings) {
     await fetch('/ip-management/assign', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         mobile: mapping.mobile,
         clientId: mapping.clientId,
         mobileType: mapping.type,
         assignmentReason: 'Migrated from existing system'
       })
     });
   }
   ```

## Support

For issues or questions:
1. Check the API responses for detailed error messages
2. Review the logs for assignment and mapping operations
3. Use the statistics endpoint to monitor system health
4. Refer to the examples in `/examples/ip-management-examples.ts`
