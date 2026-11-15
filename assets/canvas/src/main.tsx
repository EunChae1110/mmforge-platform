import '@fontsource-variable/geist/wght.css'
import { createRoot } from 'react-dom/client'
import { Canvas } from './canvas/Canvas'
import './canvas/canvas.css'

createRoot(document.getElementById('root')!).render(<Canvas />)
