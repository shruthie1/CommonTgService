export function getReadableTimeDifference(ms1: number, ms2: number= Date.now()): string {
  const diff = Math.abs(ms1 - ms2); // get absolute difference
  const seconds = Math.floor(diff / 1000);
  
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  let result = [];
  if (days > 0) result.push(`${days}d`);
  if (hours > 0) result.push(`${hours}h`);
  if (minutes > 0) result.push(`${minutes}m`);
  if (secs > 0 || result.length === 0) result.push(`${secs}s`);

  return result.join(" ");
}
