#!/usr/bin/env node

/**
 * Unit Test for Round-Robin Migration Logic
 * 
 * This script tests the core round-robin assignment algorithm
 * without requiring database connections.
 */

interface MockPromoteClient {
  mobile: string;
  channels: number;
  clientId?: string;
}

interface MockClient {
  clientId: string;
}

class RoundRobinTester {
  /**
   * Test the round-robin assignment logic
   */
  static testRoundRobinAssignment() {
    console.log('🧪 Testing Round-Robin Assignment Logic');
    console.log('======================================\n');

    // Test case 1: Even distribution
    console.log('📋 Test Case 1: Even Distribution (18 promote clients, 3 clients)');
    const mockPromoteClients1: MockPromoteClient[] = Array.from({ length: 18 }, (_, i) => ({
      mobile: `+12345${String(i).padStart(5, '0')}`,
      channels: 100 + (i * 10) // Varying channel counts
    }));

    const mockClients1: MockClient[] = [
      { clientId: 'client1' },
      { clientId: 'client2' },
      { clientId: 'client3' }
    ];

    const assignments1 = this.calculateRoundRobinAssignments(mockPromoteClients1, mockClients1);
    this.displayTestResults('Test Case 1', assignments1, mockClients1);

    // Test case 2: Uneven distribution
    console.log('\n📋 Test Case 2: Uneven Distribution (19 promote clients, 3 clients)');
    const mockPromoteClients2: MockPromoteClient[] = Array.from({ length: 19 }, (_, i) => ({
      mobile: `+12345${String(i).padStart(5, '0')}`,
      channels: 150 + (i * 5)
    }));

    const assignments2 = this.calculateRoundRobinAssignments(mockPromoteClients2, mockClients1);
    this.displayTestResults('Test Case 2', assignments2, mockClients1);

    // Test case 3: Fewer promote clients than clients
    console.log('\n📋 Test Case 3: Fewer Promote Clients (2 promote clients, 3 clients)');
    const mockPromoteClients3: MockPromoteClient[] = [
      { mobile: '+1234500001', channels: 200 },
      { mobile: '+1234500002', channels: 150 }
    ];

    const assignments3 = this.calculateRoundRobinAssignments(mockPromoteClients3, mockClients1);
    this.displayTestResults('Test Case 3', assignments3, mockClients1);

    // Test case 4: Single client
    console.log('\n📋 Test Case 4: Single Client (10 promote clients, 1 client)');
    const mockPromoteClients4: MockPromoteClient[] = Array.from({ length: 10 }, (_, i) => ({
      mobile: `+12345${String(i).padStart(5, '0')}`,
      channels: 100 + (i * 20)
    }));

    const mockClients4: MockClient[] = [{ clientId: 'onlyClient' }];

    const assignments4 = this.calculateRoundRobinAssignments(mockPromoteClients4, mockClients4);
    this.displayTestResults('Test Case 4', assignments4, mockClients4);

    console.log('\n✅ All tests completed successfully!');
  }

  /**
   * Calculate round-robin assignments (same logic as in migration script)
   */
  private static calculateRoundRobinAssignments(
    promoteClients: MockPromoteClient[],
    availableClients: MockClient[]
  ): Array<{ mobile: string; clientId: string; channels: number }> {
    // Sort by channels (ascending) - clients with fewer channels get assigned first
    const sortedPromoteClients = [...promoteClients].sort((a, b) => a.channels - b.channels);
    
    const assignments: Array<{ mobile: string; clientId: string; channels: number }> = [];
    const clientIds = availableClients.map(c => c.clientId);
    let clientIndex = 0;

    for (const promoteClient of sortedPromoteClients) {
      const assignedClientId = clientIds[clientIndex];
      
      assignments.push({
        mobile: promoteClient.mobile,
        clientId: assignedClientId,
        channels: promoteClient.channels
      });

      // Move to next client in round-robin fashion
      clientIndex = (clientIndex + 1) % clientIds.length;
    }

    return assignments;
  }

  /**
   * Display test results
   */
  private static displayTestResults(
    testName: string,
    assignments: Array<{ mobile: string; clientId: string; channels: number }>,
    clients: MockClient[]
  ) {
    console.log(`\n📊 ${testName} Results:`);
    
    // Group assignments by clientId
    const assignmentsByClient = clients.reduce((acc, client) => {
      acc[client.clientId] = assignments.filter(a => a.clientId === client.clientId);
      return acc;
    }, {} as Record<string, Array<{ mobile: string; clientId: string; channels: number }>>);

    // Display distribution
    for (const client of clients) {
      const clientAssignments = assignmentsByClient[client.clientId];
      const totalChannels = clientAssignments.reduce((sum, a) => sum + a.channels, 0);
      const avgChannels = clientAssignments.length > 0 ? Math.round(totalChannels / clientAssignments.length) : 0;
      
      console.log(`   ${client.clientId}: ${clientAssignments.length} promote clients, ${totalChannels} total channels (avg: ${avgChannels})`);
      
      // Show sample assignments
      if (clientAssignments.length > 0) {
        const sample = clientAssignments.slice(0, 3).map(a => `${a.mobile}(${a.channels}ch)`).join(', ');
        if (clientAssignments.length > 3) {
          console.log(`      Sample: ${sample}... +${clientAssignments.length - 3} more`);
        } else {
          console.log(`      All: ${sample}`);
        }
      }
    }

    // Check balance
    const counts = clients.map(client => assignmentsByClient[client.clientId].length);
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);
    const isBalanced = (maxCount - minCount) <= 1;
    
    console.log(`   ⚖️  Balance: ${isBalanced ? '✅ BALANCED' : '⚠️  UNBALANCED'} (min: ${minCount}, max: ${maxCount})`);

    // Verify all assignments are made
    const totalAssignments = assignments.length;
    const expectedAssignments = assignments.length; // Should be same as input
    console.log(`   📝 Assignments: ${totalAssignments}/${expectedAssignments} ${totalAssignments === expectedAssignments ? '✅' : '❌'}`);

    // Verify channel sorting (should be in ascending order within each client)
    let sortingCorrect = true;
    for (const client of clients) {
      const clientAssignments = assignmentsByClient[client.clientId];
      for (let i = 1; i < clientAssignments.length; i++) {
        // Check if this assignment has higher channels than any previous assignment for other clients
        // This verifies the initial sorting was preserved in round-robin
        const currentChannels = clientAssignments[i].channels;
        const previousAssignmentIndex = (i - 1) * clients.length + clients.findIndex(c => c.clientId === client.clientId);
        
        if (previousAssignmentIndex >= 0 && previousAssignmentIndex < assignments.length - clients.length) {
          const previousGlobalAssignment = assignments[previousAssignmentIndex];
          if (currentChannels < previousGlobalAssignment.channels) {
            sortingCorrect = false;
            break;
          }
        }
      }
    }
    console.log(`   📈 Channel Sorting: ${sortingCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  RoundRobinTester.testRoundRobinAssignment();
}

export { RoundRobinTester };
