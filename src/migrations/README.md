# PromoteClient Round-Robin Migration

This migration script assigns `clientId` values to existing PromoteClients that don't have one assigned, using a round-robin distribution method to ensure even allocation across all available clients.

## What This Migration Does

1. **Finds Unassigned PromoteClients**: Identifies all PromoteClients without a `clientId` assignment
2. **Sorts by Channel Count**: Orders them by channel count (ascending) so clients with fewer channels get assigned first
3. **Round-Robin Assignment**: Distributes PromoteClients evenly across all available client `clientId` values
4. **Updates Database**: Assigns the `clientId` values and sets appropriate status/message

## Features

- ✅ **Dry Run Mode**: Test the migration without making changes
- ✅ **Live Mode**: Execute the actual migration
- ✅ **Balanced Distribution**: Ensures even distribution using round-robin
- ✅ **Detailed Logging**: Comprehensive progress and statistics reporting
- ✅ **Batch Processing**: Processes updates in batches to avoid database overload
- ✅ **Error Handling**: Graceful error handling with detailed reporting
- ✅ **Statistics**: Before/after distribution comparison

## Usage

### Dry Run (Recommended First)
```bash
# Using npm script (recommended)
npm run migration:promote-clients

# Or direct execution
ts-node src/migrations/migrate-promote-clients-round-robin.ts
```

### Live Migration
```bash
# Using npm script (recommended)
npm run migration:promote-clients:live

# Or direct execution
ts-node src/migrations/migrate-promote-clients-round-robin.ts --live
```

## Example Output

### Dry Run Output
```
🚀 Starting PromoteClient Round-Robin Migration
📋 Mode: DRY RUN (no changes will be made)
📊 Gathering initial statistics...
📈 Initial Stats:
   Total PromoteClients: 45
   Unassigned PromoteClients: 18
   Available Clients: 3
🔍 Finding unassigned promote clients...
📱 Found 18 unassigned promote clients
📊 Channel count range: 120 - 285 (avg: 203)
👥 Getting available clients...
👤 Found 3 available clients: client1, client2, client3
🔄 Calculating round-robin assignments...
📋 Assignment Plan:
   client1: 6 promote clients, 1,230 total channels
      Preview: +1234567890(120ch), +1234567891(125ch), +1234567892(130ch)... +3 more
   client2: 6 promote clients, 1,245 total channels
      Preview: +1234567893(135ch), +1234567894(140ch), +1234567895(145ch)... +3 more
   client3: 6 promote clients, 1,260 total channels
      Preview: +1234567896(150ch), +1234567897(155ch), +1234567898(160ch)... +3 more
⚖️  Distribution balance: ✅ BALANCED (min: 6, max: 6)

🔍 DRY RUN SUMMARY
=================
📊 Would assign 18 promote clients

📈 Projected Distribution:
client1: 8 → 14 (+6)
client2: 7 → 13 (+6)
client3: 5 → 11 (+6)

💡 To execute this migration, run with --live flag
```

### Live Migration Output
```
🚀 Starting PromoteClient Round-Robin Migration
📋 Mode: LIVE MIGRATION
📊 Gathering initial statistics...
📈 Initial Stats:
   Total PromoteClients: 45
   Unassigned PromoteClients: 18
   Available Clients: 3
   
[... assignment plan ...]

💾 Executing assignments...
🔄 Processing batch 1/2 (10 assignments)...
🔄 Processing batch 2/2 (8 assignments)...
✅ Assignment execution completed: 18 assigned, 0 errors
📊 Gathering final statistics...
📈 Remaining unassigned: 0

🎯 MIGRATION SUMMARY
==================
📊 Total PromoteClients: 45
✅ Successfully Assigned: 18
❌ Assignment Errors: 0
⏭️  Skipped: 0

📈 Distribution Comparison:
Before → After
client1: 8 → 14 (+6)
client2: 7 → 13 (+6)
client3: 5 → 11 (+6)

🎉 Migration completed successfully!
```

## Algorithm Details

### Round-Robin Assignment
1. **Sort**: PromoteClients are sorted by channel count (ascending)
2. **Iterate**: For each PromoteClient, assign to the next client in rotation
3. **Balance**: Each client gets approximately the same number of PromoteClients
4. **Fair Distribution**: If 18 PromoteClients and 3 clients, each gets 6

### Channel Count Consideration
- Clients with **fewer channels** are assigned **first**
- This ensures that clients with lower channel participation get priority
- Helps balance the overall channel distribution

## Safety Features

- **Dry Run Default**: Always runs in dry-run mode unless `--live` is specified
- **Batch Processing**: Updates are processed in small batches
- **Error Isolation**: Errors in individual assignments don't stop the entire migration
- **Detailed Logging**: Comprehensive logging for debugging and verification
- **Statistics Tracking**: Before/after comparison for verification

## Prerequisites

- Node.js and npm installed
- NestJS application properly configured
- Database connection available
- All required services properly injectable

## Post-Migration

After running the migration:
1. Verify the distribution using the PromoteClient distribution endpoint
2. Check that all PromoteClients have valid `clientId` assignments
3. Confirm that the business logic (12 PromoteClients per client) is satisfied
4. Monitor system behavior to ensure proper integration

## Rollback

If rollback is needed, you can:
1. Run a query to remove `clientId` assignments: `db.promoteClients.updateMany({}, { $unset: { clientId: 1 } })`
2. Or restore from backup if available
3. Then re-run the migration with adjustments if needed

## Troubleshooting

### Common Issues

1. **"No available clients found"**
   - Ensure clients exist in the database
   - Check that clients have valid `clientId` values

2. **"Migration failed"**
   - Check database connectivity
   - Ensure all required services are available
   - Review error logs for specific issues

3. **Unbalanced distribution**
   - This is normal if the number of PromoteClients is not evenly divisible by the number of clients
   - The algorithm ensures the difference is never more than 1

### Debug Mode
Add environment variable for more detailed logging:
```bash
DEBUG=* npm run migration:promote-clients
```
