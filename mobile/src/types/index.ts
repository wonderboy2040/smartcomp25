/**
 * SmartComp Mobile — type definitions.
 * Mirrors the API response shapes used by the web app's /api/* routes.
 * Kept as a local copy (not imported from the web app) to keep the
 * mobile bundle decoupled from Next.js-specific code.
 */

export interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  address?: string
  gstin?: string
  creditBalance: number
  creditLimit: number
  creditScore: number
  notes?: string
  createdAt: string
  updatedAt: string
  _count?: { invoices: number; quotations: number }
}

export interface InvoiceItem {
  itemId?: string
  name: string
  description?: string
  hsn?: string
  qty: number
  rate: number
  discount?: number
  taxRate?: number
  total: number
}

export interface Invoice {
  id: string
  invoiceNumber: string
  customerId: string
  customerName: string
  customerPhone?: string
  customerGstin?: string
  date: string
  items: InvoiceItem[]
  subtotal: number
  totalDiscount: number
  totalTax: number
  grandTotal: number
  paymentMode: 'Cash' | 'UPI' | 'Card' | 'Credit' | 'BankTransfer' | 'Cheque' | 'Razorpay'
  paymentStatus: 'Paid' | 'Partial' | 'Unpaid'
  paidAmount: number
  balanceDue: number
  profit: number
  notes?: string
  createdAt: string
}

export interface Item {
  id: string
  name: string
  sku?: string
  barcode?: string
  hsn?: string
  category?: string
  brand?: string
  model?: string
  description?: string
  costPrice: number
  sellingPrice: number
  mrp?: number
  stock: number
  minStock: number
  unit?: string
  taxRate?: number
  reorderLevel?: number
  hasSerials?: boolean
  imageBase64?: string
  createdAt: string
  updatedAt: string
}

export interface JobPart {
  name: string
  qty: number
  rate: number
  total: number
}

export interface JobStatusHistoryEntry {
  status: string
  at: string
  note?: string
  by?: string
}

export type JobStatus = 'Pending' | 'In Progress' | 'Awaiting Parts' | 'Ready' | 'Delivered' | 'Cancelled'
export type JobPriority = 'Low' | 'Medium' | 'High' | 'Urgent'
export type ServiceType = 'InShop' | 'OnSite' | 'Pickup'

export interface Job {
  id: string
  jobId: string
  trackToken: string
  trackUrl?: string
  customerName: string
  customerMobile: string
  customerEmail?: string
  deviceType: string
  brandModel: string
  serialNumber: string
  problemDesc: string
  accessories: string
  serviceType: ServiceType
  priority: JobPriority
  status: JobStatus
  assignedEngineer?: string
  estimatedAmount: number
  advanceAmount: number
  finalAmount: number
  serviceCharge: number
  paidAmount: number
  paymentMode?: string
  partsProfit: number
  serviceProfit: number
  warrantyDays: number
  warrantyExpiry?: string
  diagnosisNotes: string
  feedbackRating: number
  feedbackComment: string
  feedbackAt: string
  partsUsed: JobPart[]
  statusHistory: JobStatusHistoryEntry[]
  ageDays: number
  isOverdue: boolean
  total: number
  advance: number
  paid: number
  paidTotal: number
  balanceDue: number
  createdAt: string
  updatedAt?: string
}

export interface DashboardStats {
  totalItems: number
  lowStockCount: number
  totalCustomers: number
  totalSuppliers: number
  stockValueCost: number
  stockValueSelling: number
  monthSales: number
  monthProfit: number
  monthCashSales: number
  monthCreditSales: number
  totalOutstanding: number
  monthQuotationValue: number
  totalQuotations: number
  todayPaymentTotal: number
  pendingEnquiries: number
  totalJobs: number
  pendingJobs: number
  completedJobs: number
  deliveredJobs: number
  highPriorityJobs: number
  todayJobs: number
  monthJobs: number
  todayServiceTotal: number
  todayServiceUPI: number
  todayServiceCash: number
  monthServiceTotal: number
  monthServiceUPI: number
  monthServiceCash: number
}

export interface DashboardData {
  stats: DashboardStats
  pendingInvoices: Invoice[]
  recentInvoices: Invoice[]
  recentPayments: any[]
  recentEnquiries: any[]
  lowStockList: Item[]
  recentJobs: Job[]
  salesTrend: Array<{ date: string; dayName: string; sales: number; profit: number; invoices: number }>
  topCustomers: Array<{ id: string; name: string; phone: string; totalValue: number; invoiceCount: number; lastPurchase: string; avgOrderValue: number }>
  lowMarginProducts: Item[]
}

export interface AuthStatus {
  pinRequired: boolean
  authenticated: boolean
}

export interface ApiResponse<T> {
  data?: T
  error?: string
  status: number
}

export interface CustomerStatementRow {
  type: 'invoice' | 'service' | 'payment' | 'service_payment'
  date: string
  description: string
  reference: string
  debit: number
  credit: number
  balance: number
}

export interface CustomerStatement {
  customerId: string
  customerName: string
  customerPhone: string
  openingBalance: number
  closingBalance: number
  totalDebit: number
  totalCredit: number
  rows: CustomerStatementRow[]
}

export interface OfflineQueueEntry {
  id: string
  method: 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
  createdAt: number
  retryCount: number
  lastError?: string
}
