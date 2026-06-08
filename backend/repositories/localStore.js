import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = process.env.LOCAL_DATA_DIR
  ? path.resolve(process.env.LOCAL_DATA_DIR)
  : path.resolve(currentDirectory, '../data')
const writeQueues = new Map()

const getDataFile = (name) => path.join(dataDirectory, `${name}.json`)

export const readLocalCollection = async (name) => {
  try {
    const contents = await readFile(getDataFile(name), 'utf8')
    const records = JSON.parse(contents)
    return Array.isArray(records) ? records : []
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

export const mutateLocalCollection = async (name, mutator) => {
  const previousQueue = writeQueues.get(name) || Promise.resolve()
  let result

  const nextQueue = previousQueue.then(async () => {
    const records = await readLocalCollection(name)
    result = await mutator(records)
    await mkdir(dataDirectory, { recursive: true })
    await writeFile(
      getDataFile(name),
      `${JSON.stringify(records, null, 2)}\n`,
      'utf8',
    )
  })

  writeQueues.set(name, nextQueue.catch(() => {}))
  await nextQueue
  return result
}
