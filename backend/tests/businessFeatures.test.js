import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('local stock movements and system settings persist correctly', async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'jotun-billing-business-'),
  )
  process.env.LOCAL_DATA_DIR = dataDirectory

  try {
    const catalog = await import(
      `../repositories/catalogRepository.js?business=${Date.now()}`
    )
    const settings = await import(
      `../repositories/settingsRepository.js?business=${Date.now()}`
    )
    const purchases = await import(
      `../repositories/purchaseRepository.js?business=${Date.now()}`
    )

    const product = await catalog.createCatalogRecord('products', {
      name: 'Jotun Test Paint',
      itemCode: 'TEST-001',
      unit: 'can',
      unitPrice: 25,
      costPrice: 20,
      stockQuantity: 10,
      lowStockThreshold: 3,
    })
    const stockedIn = await catalog.recordProductStockMovement(product._id, {
      type: 'in',
      quantity: 5,
      note: 'Purchase',
      actor: 'owner',
    })
    assert.equal(stockedIn.stockQuantity, 15)

    const stockedOut = await catalog.recordProductStockMovement(product._id, {
      type: 'out',
      quantity: 4,
      note: 'Sale',
      actor: 'owner',
    })
    assert.equal(stockedOut.stockQuantity, 11)
    assert.equal(stockedOut.stockMovements.length, 2)
    assert.equal(stockedOut.stockMovements[1].resultingStock, 11)

    const supplier = await catalog.createCatalogRecord('suppliers', {
      name: 'Jotun Cambodia',
      phone: '012 000 111',
      email: 'supplier@example.com',
      address: 'Phnom Penh',
    })
    const purchaseNumber = await purchases.reservePurchaseNumber(
      '2026-06-08',
    )
    const purchase = await purchases.insertPurchase({
      purchaseNumber,
      purchaseDate: '2026-06-08T00:00:00.000Z',
      supplierId: supplier._id,
      supplier: { name: supplier.name, phone: supplier.phone },
      items: [
        {
          productId: product._id,
          name: product.name,
          unit: product.unit,
          quantity: 9,
          unitCost: 10,
          total: 90,
        },
      ],
      subtotal: 90,
      notes: '',
      createdBy: 'owner',
      updatedBy: 'owner',
    })
    assert.equal(purchase.status, 'draft')

    const receiveResults = await Promise.all([
      purchases.receiveDraftPurchase(purchase._id, 'owner'),
      purchases.receiveDraftPurchase(purchase._id, 'owner'),
    ])
    const receivedPurchase = receiveResults.find(Boolean)
    const purchasedProduct = await catalog.findCatalogRecord(
      'products',
      product._id,
    )
    assert.equal(receivedPurchase.status, 'received')
    assert.equal(receiveResults.filter(Boolean).length, 1)
    assert.equal(purchasedProduct.stockQuantity, 20)
    assert.equal(purchasedProduct.costPrice, 15.5)
    assert.equal(purchasedProduct.stockMovements.length, 3)
    assert.equal(
      purchasedProduct.stockMovements[2].referenceType,
      'purchase',
    )

    const salesperson = await catalog.createCatalogRecord('salespeople', {
      name: 'Sokha Sale',
      phone: '012 345 678',
      notes: 'North area',
    })
    const salespeople = await catalog.listCatalogRecords('salespeople', {
      search: 'Sokha',
    })
    assert.equal(salespeople.total, 1)
    assert.equal(salespeople.items[0]._id, salesperson._id)

    await settings.saveSystemSettings({
      companyName: 'Updated Company',
      phones: ['012 345 678'],
      sellerSignature: 'data:image/png;base64,c2lnbmF0dXJl',
      invoiceFontSize: 14.5,
      invoicePaperSize: 'a5',
      updatedBy: 'owner',
    })
    const savedSettings = await settings.getSystemSettings()
    assert.equal(savedSettings.companyName, 'Updated Company')
    assert.deepEqual(savedSettings.phones, ['012 345 678'])
    assert.equal(
      savedSettings.sellerSignature,
      'data:image/png;base64,c2lnbmF0dXJl',
    )
    assert.equal(savedSettings.invoiceFontSize, 14.5)
    assert.equal(savedSettings.invoicePaperSize, 'a5')
  } finally {
    delete process.env.LOCAL_DATA_DIR
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

test('revenue report groups deposits and payment history by date', async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'jotun-billing-report-'),
  )
  process.env.LOCAL_DATA_DIR = dataDirectory

  try {
    const repository = await import(
      `../repositories/invoiceRepository.js?report=${Date.now()}`
    )
    const controller = await import(
      `../controllers/reportController.js?report=${Date.now()}`
    )

    await repository.insertInvoice({
      invoiceNumber: 'INV-2026-00001',
      invoiceDate: '2026-06-01T00:00:00.000Z',
      dueDate: '2026-06-10T00:00:00.000Z',
      customer: { name: 'Report Customer' },
      salesChannel: 'salesperson',
      salespersonId: 'sale-1',
      salesperson: { name: 'Sokha Sale', phone: '012 345 678' },
      items: [
        {
          description: 'Jotun Paint',
          colorCode: '1024',
          quantity: 2,
          unit: 'can',
          unitPrice: 50,
          total: 100,
        },
      ],
      subtotal: 100,
      grandTotal: 100,
      depositAmount: 20,
      paidAmount: 50,
      balanceDue: 50,
      status: 'partially_paid',
      payments: [
        {
          _id: 'payment-1',
          amount: 30,
          paidAt: '2026-06-05T00:00:00.000Z',
          receivedBy: 'Owner',
        },
      ],
    })

    let responseBody
    let statusCode = 200
    const req = {
      query: {
        from: '2026-06-01',
        to: '2026-06-30',
        groupBy: 'day',
      },
    }
    const res = {
      status(code) {
        statusCode = code
        return this
      },
      json(payload) {
        responseBody = payload
        return this
      },
    }

    await controller.getRevenueReport(req, res)
    assert.equal(statusCode, 200)
    assert.equal(responseBody.summary.revenue, 50)
    assert.equal(responseBody.summary.invoiceCount, 1)
    assert.deepEqual(
      responseBody.trend.map((item) => item.revenue),
      [20, 30],
    )
    assert.equal(responseBody.salesPerformance[0].label, 'Sokha Sale')
    assert.equal(responseBody.salesPerformance[0].invoiced, 100)
    assert.equal(responseBody.salesItems[0].productName, 'Jotun Paint')
    assert.equal(responseBody.salesItems[0].quantity, 2)
  } finally {
    delete process.env.LOCAL_DATA_DIR
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
