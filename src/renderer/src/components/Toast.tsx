export interface ToastState {
  message: string
  type?: 'info' | 'error'
  duration?: number
  action?: { label: string; onClick: () => void }
}

export default function Toast({
  toast,
  onClose
}: {
  toast: ToastState
  onClose: () => void
}): JSX.Element {
  return (
    <div className={`toast ${toast.type === 'error' ? 'error' : ''}`} onClick={onClose}>
      <span>{toast.message}</span>
      {toast.action && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            toast.action!.onClick()
            onClose()
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}
