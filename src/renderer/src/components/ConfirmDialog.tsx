import type { ReactNode } from 'react'
import Dialog, { DialogButton } from './Dialog'

// Asks before a destructive action. The safe choice has focus.
export default function ConfirmDialog(props: {
  title: string
  confirmLabel: string
  onConfirm(): void
  onCancel(): void
  children: ReactNode
}) {
  return (
    <Dialog
      title={props.title}
      onClose={props.onCancel}
      footer={
        <>
          <DialogButton onClick={props.onCancel} autoFocus>
            Cancel
          </DialogButton>
          <DialogButton kind="danger" onClick={props.onConfirm}>
            {props.confirmLabel}
          </DialogButton>
        </>
      }
    >
      {props.children}
    </Dialog>
  )
}
