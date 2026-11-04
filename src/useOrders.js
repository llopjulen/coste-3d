import { useCallback, useEffect, useMemo, useState } from 'react'
import { createOrder, sortOrders } from './orders.js'
import { createCustomer, findByName, sortCustomers } from './customers.js'

/* ==================================================================
   useOrders — orders and customers on screen, kept in step with a store.

   The screen asks this hook; the hook asks the store (ordersStore.js).
   Writes are OPTIMISTIC: the screen changes at once and the store is
   told after. If the store fails (full browser today; no network
   tomorrow with Supabase), the error is shown and everything is read
   again from the store, so the screen never keeps a change that wasn't
   saved. With localStorage the write is instant and that never shows;
   over a network it's the difference between a snappy app and a
   spinner on every tap.

   Lives in App (not in the Orders tab) because the calendar and History
   need the orders too, and a restore must reload them.
================================================================== */
export function useOrders(store) {
  const [data, setData] = useState({ status: 'loading', orders: [], customers: [] })
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    try {
      const loaded = await store.load()
      setData({ status: 'ready', orders: loaded.orders, customers: loaded.customers })
    } catch (err) {
      console.error(err)
      setData(current => ({ ...current, status: 'error' }))
    }
  }, [store])

  // First load. The state is set when the promise resolves, not during the
  // effect itself, so this is the "subscribe to an external source" case.
  useEffect(() => {
    let alive = true
    store.load().then(
      loaded => { if (alive) setData({ status: 'ready', orders: loaded.orders, customers: loaded.customers }) },
      err => { console.error(err); if (alive) setData(current => ({ ...current, status: 'error' })) },
    )
    return () => { alive = false }
  }, [store])

  // Runs a store write after the optimistic change; on failure, says so and
  // re-reads the truth from the store.
  const persist = useCallback(async write => {
    try {
      await write()
      setError(null)
      return true
    } catch (err) {
      console.error(err)
      setError('save')
      await reload()
      return false
    }
  }, [reload])

  const saveOrder = useCallback(order => {
    setData(current => ({ ...current, orders: sortOrders([...current.orders.filter(o => o.id !== order.id), order]) }))
    return persist(() => store.saveOrder(order))
  }, [store, persist])

  const deleteOrder = useCallback(id => {
    setData(current => ({ ...current, orders: current.orders.filter(o => o.id !== id) }))
    return persist(() => store.deleteOrder(id))
  }, [store, persist])

  const saveCustomer = useCallback(customer => {
    setData(current => ({ ...current, customers: sortCustomers([...current.customers.filter(c => c.id !== customer.id), customer]) }))
    return persist(() => store.saveCustomer(customer))
  }, [store, persist])

  const deleteCustomer = useCallback(id => {
    setData(current => ({
      ...current,
      customers: current.customers.filter(c => c.id !== id),
      orders: current.orders.map(o => (o.customerId === id ? { ...o, customerId: null } : o)),
    }))
    return persist(() => store.deleteCustomer(id))
  }, [store, persist])

  /* A new order. `customerName` without `customerId` reuses a card with the
     same name or creates one, so "Bar Pepe" never ends up twice. The number
     is asked to the store, which is the only one that knows the last one. */
  const addOrder = useCallback(async ({ customerId, customerName, lines, dueAt, channel }) => {
    try {
      let customer = data.customers.find(c => c.id === customerId) ?? null
      const name = customerName?.trim()
      if (!customer && name) {
        customer = findByName(data.customers, name)
        if (!customer) {
          customer = createCustomer({ name })
          await store.saveCustomer(customer)
          setData(current => ({ ...current, customers: sortCustomers([...current.customers, customer]) }))
        }
      }
      const number = await store.nextOrderNumber()
      const order = createOrder({ number, customer, lines, dueAt, channel })
      await store.saveOrder(order)
      setData(current => ({ ...current, orders: sortOrders([...current.orders, order]) }))
      setError(null)
      return order
    } catch (err) {
      console.error(err)
      setError('save')
      await reload()
      return null
    }
  }, [data.customers, store, reload])

  return useMemo(() => ({
    ...data,
    error,
    clearError: () => setError(null),
    reload,
    saveOrder,
    deleteOrder,
    saveCustomer,
    deleteCustomer,
    addOrder,
  }), [data, error, reload, saveOrder, deleteOrder, saveCustomer, deleteCustomer, addOrder])
}
