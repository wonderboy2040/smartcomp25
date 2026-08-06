/**
 * Zod validators for all API entities - v3.0 upgrade
 * Ensures data integrity before hitting Google Sheets
 */
import { z } from 'zod'

export const itemSchema = z.object({
  name: z.string().min(1, 'Name required').max(200),
  sku: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  gstApplicable: z.boolean().optional(),
  gstRate: z.number().min(0).max(100).optional(),
  costPrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional(),
  quantity: z.number().min(0).optional(),
  minQuantity: z.number().min(0).optional(),
  unit: z.string().max(20).optional(),
  hsnCode: z.string().max(20).optional(),
  supplierId: z.string().max(100).optional(),
  warrantyDays: z.number().min(0).optional(),
})

export const customerSchema = z.object({
  name: z.string().min(1, 'Name required').max(200),
  phone: z.string().max(20).optional(),
  email: z.string().email().or(z.literal('')).optional(),
  address: z.string().max(500).optional(),
  gstNumber: z.string().max(20).optional(),
  state: z.string().max(100).optional(),
  creditLimit: z.number().min(0).optional(),
  creditDays: z.number().min(0).optional(),
  birthday: z.string().optional(),
})

export const supplierSchema = z.object({
  name: z.string().min(1, 'Name required').max(200),
  phone: z.string().max(20).optional(),
  whatsappNumber: z.string().max(20).optional(),
  email: z.string().email().or(z.literal('')).optional(),
  company: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  suppliedItems: z.string().max(500).optional(),
  active: z.boolean().optional(),
  includeInAutoEnquiry: z.boolean().optional(),
})

export const invoiceItemSchema = z.object({
  itemId: z.string().optional(),
  name: z.string().min(1),
  quantity: z.number().min(0.01),
  sellingPrice: z.number().min(0),
  costPrice: z.number().min(0).optional(),
  gstRate: z.number().min(0).max(100).optional(),
  gstApplicable: z.boolean().optional(),
})

export const invoiceSchema = z.object({
  customerId: z.string().min(1, 'Customer required'),
  items: z.array(invoiceItemSchema).min(1, 'At least one item required'),
  courierCharges: z.number().min(0).optional(),
  otherCharges: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  paymentType: z.enum(['cash', 'credit', 'upi', 'card', 'mixed']).optional(),
  amountPaid: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
  date: z.string().optional(),
  deductStock: z.boolean().optional(),
})

export const jobSchema = z.object({
  customerName: z.string().min(1, 'Customer name required').max(200),
  customerMobile: z.string().min(10).max(15),
  deviceType: z.enum(['Laptop', 'Desktop', 'Printer', 'Monitor', 'UPS', 'Scanner', 'Other']),
  brandModel: z.string().max(200).optional(),
  serialNumber: z.string().max(200).optional(),
  problemDesc: z.string().min(1, 'Problem description required').max(2000),
  accessories: z.string().max(500).optional(),
  serviceType: z.enum(['InShop', 'Onsite']).optional(),
  priority: z.enum(['Low', 'Medium', 'High']).optional(),
  estimatedAmount: z.number().min(0).optional(),
  advanceAmount: z.number().min(0).optional(),
  advanceMode: z.string().optional(),
  assignedEngineer: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  warrantyDays: z.number().min(0).optional(),
})

export const expenseSchema = z.object({
  category: z.string().min(1, 'Category required').max(100),
  description: z.string().min(1).max(500),
  amount: z.number().min(0.01, 'Amount must be > 0'),
  mode: z.string().max(50).optional(),
  date: z.string().optional(),
  vendor: z.string().max(200).optional(),
  reference: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
})

export const paymentSchema = z.object({
  amount: z.number().min(0.01),
  type: z.string().min(1),
  date: z.string().optional(),
  notes: z.string().max(500).optional(),
  reference: z.string().max(200).optional(),
})

export const amcSchema = z.object({
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  devicesCoveredJson: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  fee: z.number().min(0),
  frequency: z.string().optional(),
  visitsIncluded: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
})

export const serialSchema = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  serialNumber: z.string().min(1).max(200),
  status: z.string().optional(),
  invoiceId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  customerName: z.string().optional(),
  purchaseDate: z.string().optional(),
  warrantyDays: z.number().optional(),
  costPrice: z.number().optional(),
  notes: z.string().max(500).optional(),
})

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data)
  if (result.success) return { success: true, data: result.data }
  const firstError = result.error.issues[0]
  return { success: false, error: firstError ? `${firstError.path.join('.')}: ${firstError.message}` : 'Validation failed' }
}
