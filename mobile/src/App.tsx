import { useCallback, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import HomeScreen from './components/HomeScreen'
import Scanner from './components/Scanner'
import ApproveSheet from './components/ApproveSheet'
import { extractPairCode } from './lib/pairing'

export default function App() {
  const [scanning, setScanning] = useState(false)
  // Scanning the QR with the iPhone Camera app lands on /pair/:code directly.
  const [pairCode, setPairCode] = useState<string | null>(() => extractPairCode(window.location.pathname))

  const closeSheet = useCallback(() => {
    setPairCode(null)
    if (window.location.pathname !== '/') window.history.replaceState(null, '', '/')
  }, [])

  return (
    <>
      <HomeScreen onScan={() => setScanning(true)} />

      <AnimatePresence>
        {scanning && (
          <Scanner
            key="scanner"
            onClose={() => setScanning(false)}
            onCode={(code) => {
              setScanning(false)
              setPairCode(code)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{pairCode && <ApproveSheet key={pairCode} code={pairCode} onClose={closeSheet} />}</AnimatePresence>
    </>
  )
}
