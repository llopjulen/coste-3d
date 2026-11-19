/* ==================================================================
   ORDERS STORE — where orders and customers are kept.

   The screen never touches localStorage or the database directly: it
   talks to a STORE with the methods below. Today there is one, the local
   store (this browser). Julen's Supabase store will be a second object
   with the same methods, and the screen won't notice the change: that is
   the whole point of the adapter (same idea as a Java interface with two
   implementations).

   The contract (every method returns a Promise, because a network store
   is asynchronous; the local one just resolves at once):

     load()                 -> { orders, customers }  (sanitized, sorted)
     nextOrderNumber()      -> integer, never repeated, never going down
     saveOrder(order)       -> order as stored   (insert or update by id)
     deleteOrder(id)        -> void
     saveCustomer(customer) -> customer as stored
     deleteCustomer(id)     -> void; orders keep their customerName and
                               lose the link (SQL: on delete set null)

   Errors: a failed write throws StoreError, so the screen can say "not
   saved" instead of showing data that isn't stored anywhere.
   The rules a database must also enforce (owner only, number unique per
   person, the limits) are in docs/PEDIDOS.md.
================================================================== */
import { MAX_ORDERS, sanitizeOrder, sanitizeOrders, sortOrders } from './orders.js'
import { MAX_CUSTOMERS, sanitizeCustomer, sanitizeCustomers, sortCustomers } from './customers.js'
import { KEYS, writeAtomically } from './backup.js'

// The key names live in backup.js (KEYS), with every other key the app owns.
export const ORDER_KEYS = { orders: KEYS.orders, customers: KEYS.customers, counter: KEYS.orderCounter }

export class StoreError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'StoreError'
    this.cause = cause
  }
}

/* The local store. `storage` is injectable for the tests (a fake with
   getItem / setItem / removeItem); in the browser it is localStorage,
   looked up lazily because merely reading it throws in some privacy modes. */
export function createLocalStore(storage) {
  const store = () => storage ?? globalThis.localStorage
  const read = key => {
    try { return JSON.parse(store().getItem(key)) } catch { return null }
  }
  const write = (key, value) => {
    try {
      store().setItem(key, JSON.stringify(value))
    } catch (err) {
      // QuotaExceededError (about 5 MB per site) or storage blocked.
      throw new StoreError('Could not save in this browser.', err)
    }
  }
  const orders = () => sanitizeOrders(read(ORDER_KEYS.orders))
  const customers = () => sanitizeCustomers(read(ORDER_KEYS.customers))

  return {
    kind: 'local',

    async load() {
      return { orders: orders(), customers: customers() }
    },

    /* The counter is stored on its own and also checked against the
       numbers in use: a restored or merged list may hold higher ones. */
    async nextOrderNumber() {
      const stored = Number(read(ORDER_KEYS.counter))
      const highest = orders().reduce((max, o) => Math.max(max, o.number), 0)
      const next = Math.max(Number.isSafeInteger(stored) ? stored : 0, highest) + 1
      write(ORDER_KEYS.counter, next)
      return next
    },

    async saveOrder(order) {
      const clean = sanitizeOrder(order)
      if (!clean) throw new StoreError('Invalid order.')
      const list = orders().filter(o => o.id !== clean.id)
      if (list.some(o => o.number === clean.number)) throw new StoreError('Order number already in use.')
      if (list.length >= MAX_ORDERS) throw new StoreError('Too many orders.')
      write(ORDER_KEYS.orders, sortOrders([...list, clean]))
      return clean
    },

    async deleteOrder(id) {
      write(ORDER_KEYS.orders, orders().filter(o => o.id !== id))
    },

    async saveCustomer(customer) {
      const clean = sanitizeCustomer(customer)
      if (!clean) throw new StoreError('Invalid customer.')
      const list = customers().filter(c => c.id !== clean.id)
      if (list.length >= MAX_CUSTOMERS) throw new StoreError('Too many customers.')
      write(ORDER_KEYS.customers, sortCustomers([...list, clean]))
      return clean
    },

    /* Like a foreign key with ON DELETE SET NULL: the orders stay, with the
       name they were made with, and just stop pointing to the card. */
    async deleteCustomer(id) {
      const unlinked = orders().map(o => (o.customerId === id ? { ...o, customerId: null } : o))
      // Both keys or neither (writeAtomically rolls back by hand): a customer
      // gone while orders still point to it would be a dangling reference.
      try {
        writeAtomically({
          [ORDER_KEYS.orders]: JSON.stringify(unlinked),
          [ORDER_KEYS.customers]: JSON.stringify(customers().filter(c => c.id !== id)),
        }, store())
      } catch (err) {
        throw new StoreError('Could not save in this browser.', err)
      }
    },
  }
}
