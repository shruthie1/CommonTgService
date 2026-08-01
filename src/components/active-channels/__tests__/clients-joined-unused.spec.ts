import * as fs from 'fs';
import * as path from 'path';

describe('clientsJoined counter is no longer written', () => {
  it('has zero calls to incrementClientsJoined outside its own definition', () => {
    const root = path.resolve(__dirname, '../../../');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts')) {
          const text = fs.readFileSync(full, 'utf8');
          // The definition line contains "async incrementClientsJoined"; a *call* is ".incrementClientsJoined("
          if (/\.incrementClientsJoined\s*\(/.test(text)) hits.push(full);
        }
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });
});
