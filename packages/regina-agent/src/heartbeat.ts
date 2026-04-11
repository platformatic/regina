export function createHeartbeat (coordinatorId: string, instanceId: string): () => void {
  const url = `http://${coordinatorId}.plt.local/instances/${instanceId}/heartbeat`

  return function heartbeat () {
    fetch(url, { method: 'POST', signal: AbortSignal.timeout(5000) })
      .then(res => res.body?.cancel())
      .catch(() => {})
  }
}
