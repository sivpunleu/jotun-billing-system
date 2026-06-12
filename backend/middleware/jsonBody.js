import express from 'express'

const createJsonParser = (limit) => express.json({ limit })

export const standardJsonBody = createJsonParser('1mb')
export const settingsJsonBody = createJsonParser('12mb')
export const backupJsonBody = createJsonParser('25mb')
