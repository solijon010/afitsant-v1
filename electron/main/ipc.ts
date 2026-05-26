import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import * as auth from './services/auth'
import * as menu from './services/menu'
import * as tables from './services/tables'
import * as orders from './services/orders'
import * as printer from './services/printer'
import * as sync from './services/syncEngine'
import * as settings from './services/settings'
import { resetApi } from './services/apiClient'

export function registerIpc(): void {
  ipcMain.handle(IPC.ping, () => 'pong')

  ipcMain.handle(IPC.authListWaiters, () => auth.listWaiters())
  ipcMain.handle(IPC.authVerifyPin, (_e, waiterId: number, pin: string) => auth.verifyPin(waiterId, pin))
  ipcMain.handle(IPC.authLogout, () => undefined)

  ipcMain.handle(IPC.menuGetCategories, () => menu.getCategories())
  ipcMain.handle(IPC.menuGetProducts, (_e, categoryId?: number) => menu.getProducts(categoryId))
  ipcMain.handle(IPC.menuGetSnapshot, () => menu.getSnapshot())

  ipcMain.handle(IPC.areasList, () => tables.listAreas())
  ipcMain.handle(IPC.tablesList, () => tables.listTables())
  ipcMain.handle(IPC.tablesSnapshot, () => tables.snapshot())
  ipcMain.handle(IPC.ordersGetByTable, (_e, tableId: number) => tables.getOpenOrderByTable(tableId))

  ipcMain.handle(IPC.ordersUpsert, (_e, input) => orders.upsertOpenOrder(input))
  ipcMain.handle(IPC.ordersAddItems, (_e, orderId: number, items: any[]) => orders.addItems(orderId, items))
  ipcMain.handle(IPC.ordersUpdateItem, (_e, itemId: number, patch: any) => orders.updateItem(itemId, patch))
  ipcMain.handle(IPC.ordersRemoveItem, (_e, itemId: number) => {
    orders.removeItem(itemId)
  })
  ipcMain.handle(IPC.ordersClose, (_e, orderId: number) => orders.closeOrder(orderId))
  ipcMain.handle(IPC.ordersCancel, (_e, orderId: number) => orders.cancelOrder(orderId))

  ipcMain.handle(IPC.printReceipt, (_e, payload) => printer.printReceipt(payload))
  ipcMain.handle(IPC.printerTest, () => printer.testPrint())
  ipcMain.handle(IPC.printerListUsb, () => printer.listUsbPrinters())

  ipcMain.handle(IPC.syncFullPull, () => sync.fullPull())
  ipcMain.handle(IPC.syncFlush, () => sync.flush())
  ipcMain.handle(IPC.syncStatus, () => sync.status())

  ipcMain.handle(IPC.settingsGet, () => settings.getSettings())
  ipcMain.handle(IPC.settingsSet, (_e, patch) => {
    const updated = settings.setSettings(patch)
    resetApi()
    return updated
  })
}
