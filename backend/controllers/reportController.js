import { getAllAdminsForBackup } from '../repositories/adminRepository.js'
import { getAllAuditLogs } from '../repositories/auditRepository.js'
import { getAllCatalogRecords } from '../repositories/catalogRepository.js'
import { getAllInvoices } from '../repositories/invoiceRepository.js'
import { writeAuditLog } from '../repositories/auditRepository.js'

const csvValue = (value) => {
  const stringValue =
    value === undefined || value === null ? '' : String(value)
  return `"${stringValue.replace(/"/g, '""')}"`
}

const dateStamp = () => new Date().toISOString().slice(0, 10)

export const exportInvoicesCsv = async (req, res) => {
  try {
    const invoices = await getAllInvoices()
    const headers = [
      'Invoice Number',
      'Date',
      'Customer',
      'Phone',
      'Status',
      'Subtotal',
      'Grand Total',
      'Paid Amount',
      'Balance Due',
      'Deleted At',
    ]
    const rows = invoices.map((invoice) => [
      invoice.invoiceNumber,
      invoice.invoiceDate,
      invoice.customer?.name,
      invoice.customer?.phone,
      invoice.status || invoice.paymentStatus,
      invoice.subtotal,
      invoice.grandTotal,
      invoice.paidAmount ??
        Number(invoice.grandTotal || 0) - Number(invoice.balanceDue || 0),
      invoice.balanceDue,
      invoice.deletedAt || '',
    ])
    const csv = [
      headers.map(csvValue).join(','),
      ...rows.map((row) => row.map(csvValue).join(',')),
    ].join('\r\n')

    await writeAuditLog({
      actor: req.admin,
      action: 'export_csv',
      entityType: 'invoice',
      summary: `${invoices.length} invoices`,
    })
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="invoices-${dateStamp()}.csv"`,
    })
    res.send(`\uFEFF${csv}`)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to export CSV' })
  }
}

export const exportDatabaseBackup = async (req, res) => {
  try {
    const [invoices, customers, products, admins, auditLogs] =
      await Promise.all([
        getAllInvoices(),
        getAllCatalogRecords('customers'),
        getAllCatalogRecords('products'),
        getAllAdminsForBackup(),
        getAllAuditLogs(),
      ])
    const backup = {
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: req.admin.username,
        formatVersion: 1,
      },
      invoices,
      customers,
      products,
      admins,
      auditLogs,
    }

    await writeAuditLog({
      actor: req.admin,
      action: 'backup',
      entityType: 'database',
      summary: 'Full JSON backup',
    })
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="jotun-billing-backup-${dateStamp()}.json"`,
    })
    res.send(JSON.stringify(backup, null, 2))
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to create backup' })
  }
}
