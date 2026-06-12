import { getStorageMode } from '../config/db.js'
import Invoice from '../models/Invoice.js'
import { backfillLocalShareAccess } from '../repositories/invoiceRepository.js'
import {
  createShareToken,
  createShareTokenExpiration,
} from '../utils/shareToken.js'

export const migrateExistingData = async () => {
  if (getStorageMode() !== 'mongodb') {
    const shareAccessCount = await backfillLocalShareAccess()
    if (shareAccessCount > 0) {
      console.log(
        `Updated public share access for ${shareAccessCount} local invoice records`,
      )
    }
    return
  }

  const result = await Invoice.updateMany(
    {
      $or: [
        { status: { $exists: false } },
        { paidAmount: { $exists: false } },
        { payments: { $exists: false } },
        { salesChannel: { $exists: false } },
      ],
    },
    [
      {
        $set: {
          paidAmount: {
            $max: [
              0,
              {
                $subtract: [
                  { $ifNull: ['$grandTotal', 0] },
                  { $ifNull: ['$balanceDue', 0] },
                ],
              },
            ],
          },
          payments: { $ifNull: ['$payments', []] },
          deletedAt: { $ifNull: ['$deletedAt', null] },
          salesChannel: { $ifNull: ['$salesChannel', 'store'] },
          salesperson: {
            $ifNull: ['$salesperson', { name: '', phone: '' }],
          },
          status: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      { $eq: ['$paymentStatus', 'paid'] },
                      { $lte: [{ $ifNull: ['$balanceDue', 0] }, 0] },
                    ],
                  },
                  then: 'paid',
                },
                {
                  case: {
                    $or: [
                      { $eq: ['$paymentStatus', 'partial'] },
                      {
                        $gt: [
                          {
                            $subtract: [
                              { $ifNull: ['$grandTotal', 0] },
                              { $ifNull: ['$balanceDue', 0] },
                            ],
                          },
                          0,
                        ],
                      },
                    ],
                  },
                  then: 'partially_paid',
                },
              ],
              default: 'unpaid',
            },
          },
        },
      },
    ],
  )

  if (result.modifiedCount > 0) {
    console.log(`Migrated ${result.modifiedCount} existing invoice records`)
  }

  const invoicesWithoutToken = await Invoice.find({
    $or: [
      { shareToken: { $exists: false } },
      { shareToken: '' },
      { shareToken: null },
    ],
  }).select('_id')

  let tokenCount = 0
  for (const invoice of invoicesWithoutToken) {
    let updated = false
    while (!updated) {
      try {
        await Invoice.updateOne(
          {
            _id: invoice._id,
            $or: [
              { shareToken: { $exists: false } },
              { shareToken: '' },
              { shareToken: null },
            ],
          },
          { $set: { shareToken: createShareToken() } },
        )
        updated = true
        tokenCount += 1
      } catch (error) {
        if (error.code !== 11000) throw error
      }
    }
  }

  if (tokenCount > 0) {
    console.log(`Generated share tokens for ${tokenCount} invoice records`)
  }

  const expirationResult = await Invoice.updateMany(
    {
      $or: [
        { shareTokenExpiresAt: { $exists: false } },
        { shareTokenExpiresAt: null },
      ],
    },
    {
      $set: {
        shareTokenExpiresAt: createShareTokenExpiration(),
      },
    },
  )
  await Invoice.updateMany(
    { shareTokenRevokedAt: { $exists: false } },
    { $set: { shareTokenRevokedAt: null } },
  )
  if (expirationResult.modifiedCount > 0) {
    console.log(
      `Added public link expiration to ${expirationResult.modifiedCount} invoice records`,
    )
  }
}
