import bcrypt from 'bcryptjs'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { validateStrongPassword } from '../utils/passwordPolicy.js'

const readline = createInterface({ input, output })
const password = await readline.question('Admin password to hash: ')
readline.close()

try {
  validateStrongPassword(password)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

const hash = await bcrypt.hash(password, 12)
console.log('\nADMIN_PASSWORD_HASH=')
console.log(hash)

