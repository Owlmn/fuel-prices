import { readFile, writeFile } from 'node:fs/promises'

const snapshot = JSON.parse(
  await readFile(new URL('../../backend/exports/snapshot.json', import.meta.url), 'utf8'),
)
if (snapshot.meta.schema_version !== '1' || !snapshot.observations.length)
  throw new Error('Invalid published export')
await writeFile(new URL('../public/snapshot.json', import.meta.url), JSON.stringify(snapshot))
console.log(
  `Snapshot ${snapshot.meta.dataset_version}: ${snapshot.observations.length} observations`,
)
