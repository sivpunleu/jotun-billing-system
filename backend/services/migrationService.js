import { getStorageMode } from '../config/db.js'
import Invoice from '../models/Invoice.js'

export const migrateExistingData = async () => {
  if (getStorageMode() !== 'mongodb') return

  const result = await Invoice.updateMany(
    {
      $or: [
        { status: { $exists: false } },
        { paidAmount: { $exists: false } },
        { payments: { $exists: false } },
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
}
