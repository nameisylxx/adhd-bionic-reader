import { useState } from 'react'
import { Segment, useDefault } from 'segmentit'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

// 设置 worker
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// 获取 pdfjs 实例
function getPdfjs() {
  return pdfjsLib
}

// 初始化中文分词器
const segment = useDefault(new Segment())

// 元音字母
const VOWELS = 'aeiouAEIOU'

// 常见辅音组合（不应在中间断开）
const CONSONANT_CLUSTERS = [
  'th', 'ch', 'sh', 'wh', 'ph', 'gh',  // 双字母辅音
  'tr', 'dr', 'br', 'cr', 'gr', 'fr', 'pr',  // r 组合
  'bl', 'cl', 'fl', 'gl', 'pl', 'sl',  // l 组合
  'sc', 'sk', 'sm', 'sn', 'sp', 'st', 'sw',  // s 组合
  'tw', 'dw', 'qu',  // 其他
  'str', 'spr', 'scr', 'spl', 'shr', 'thr'  // 三字母辅音
]

// 判断是否是元音
function isVowel(char) {
  return VOWELS.includes(char)
}

// 判断位置是否在辅音组合中间
function isInConsonantCluster(word, pos) {
  const lowerWord = word.toLowerCase()
  for (const cluster of CONSONANT_CLUSTERS) {
    for (let i = 0; i < word.length - cluster.length + 1; i++) {
      if (lowerWord.substring(i, i + cluster.length) === cluster) {
        // 如果 pos 在这个组合的中间（不是开头也不是结尾后）
        if (pos > i && pos < i + cluster.length) {
          return true
        }
      }
    }
  }
  return false
}

// 计算英文单词最佳加粗长度
function getBoldLength(word, ratio) {
  // 纯数字直接用比例
  if (/^\d+$/.test(word)) {
    return Math.max(1, Math.ceil(word.length * ratio))
  }

  const baseLen = Math.max(1, Math.ceil(word.length * ratio))
  
  // 短词直接返回
  if (word.length <= 3) {
    return Math.min(baseLen, Math.ceil(word.length / 2))
  }
  
  // 在 baseLen 附近（±2）寻找最佳断点
  const searchRange = 2
  let bestPos = baseLen
  let bestScore = -1
  
  for (let pos = Math.max(1, baseLen - searchRange); pos <= Math.min(word.length - 1, baseLen + searchRange); pos++) {
    let score = 0
    const currChar = word[pos - 1]
    const nextChar = word[pos]
    
    // 最佳：辅音后面跟元音（自然音节边界）
    if (!isVowel(currChar) && isVowel(nextChar)) {
      score += 10
    }
    
    // 次佳：元音后面跟辅音
    if (isVowel(currChar) && !isVowel(nextChar)) {
      score += 5
    }
    
    // 惩罚：在辅音组合中间断开
    if (isInConsonantCluster(word, pos)) {
      score -= 20
    }
    
    // 轻微偏好接近原始位置
    score -= Math.abs(pos - baseLen) * 0.5
    
    if (score > bestScore) {
      bestScore = score
      bestPos = pos
    }
  }
  
  return bestPos
}

// 检测是否是中文字符
function isChinese(char) {
  return /[\u4e00-\u9fff]/.test(char)
}

// 处理中文文本（使用分词）
function processChineseText(text, ratio, ignoreShort) {
  try {
    const words = segment.doSegment(text, { simple: true })
    return words.map(word => {
      // 如果不是中文词（可能是标点），直接返回
      if (!/[\u4e00-\u9fff]/.test(word)) {
        return word
      }
      // 如果启用忽略短词且词长 <= 1，不处理
      if (ignoreShort && word.length <= 1) {
        return word
      }
      // 计算重点部分长度
      const focusLen = Math.max(1, Math.ceil(word.length * ratio))
      const focusPart = word.substring(0, focusLen)
      const fadedPart = word.substring(focusLen)
      // 重点部分加粗，非重点部分降低透明度
      if (fadedPart) {
        return `<strong>${focusPart}</strong><span class="faded">${fadedPart}</span>`
      }
      return `<strong>${focusPart}</strong>`
    }).join('')
  } catch (err) {
    console.error('Chinese segmentation error:', err)
    return text
  }
}

// 处理英文单词
function processEnglishWord(word, ratio, ignoreShort) {
  // 如果启用忽略短词且单词长度 <= 3，不处理
  if (ignoreShort && word.length <= 3) {
    return word
  }
  // 使用改进的算法计算重点部分长度
  const focusLen = getBoldLength(word, ratio)
  const focusPart = word.substring(0, focusLen)
  const fadedPart = word.substring(focusLen)
  // 重点部分加粗，非重点部分降低透明度
  if (fadedPart) {
    return `<strong>${focusPart}</strong><span class="faded">${fadedPart}</span>`
  }
  return `<strong>${focusPart}</strong>`
}

function App() {
  const [text, setText] = useState('')
  const [ratio, setRatio] = useState(0.5)
  const [ignoreShort, setIgnoreShort] = useState(false)
  const [fontSize, setFontSize] = useState(18)
  const [lineHeight, setLineHeight] = useState(1.8)
  const [fadeOpacity, setFadeOpacity] = useState(0.5)
  const [fileName, setFileName] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // 从 PDF 提取文本
  async function extractTextFromPDF(file) {
    const pdfjs = await getPdfjs()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
    
    let fullText = ''
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map(item => item.str).join(' ')
      fullText += pageText + '\n\n'
    }
    return fullText.trim()
  }

  // 处理文件上传
  async function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    const fileName = file.name.toLowerCase()
    
    // 检查文件类型
    if (!fileName.endsWith('.txt') && !fileName.endsWith('.pdf')) {
      alert('Please upload a .txt or .pdf file')
      return
    }

    setIsLoading(true)
    setFileName(file.name)

    try {
      if (fileName.endsWith('.pdf')) {
        // 处理 PDF 文件
        const extractedText = await extractTextFromPDF(file)
        setText(extractedText)
      } else {
        // 处理 TXT 文件（包装成 Promise 以正确处理异步）
        const textContent = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (event) => resolve(event.target.result)
          reader.onerror = () => reject(new Error('Failed to read file'))
          reader.readAsText(file)
        })
        setText(textContent)
      }
    } catch (err) {
      console.error('File processing error:', err)
      alert('Failed to process file: ' + err.message)
      setFileName('')
    } finally {
      setIsLoading(false)
    }
  }

  // 清除文件和文本
  function handleClear() {
    setText('')
    setFileName('')
  }

  // 处理文本，支持中英文混合
  function processText(input) {
    if (!input) return ''
    
    // 将文本分割为：中文段落、英文/数字、其他字符
    // 正则：匹配连续中文 或 连续英文数字 或 其他单个字符
    const segments = input.match(/([\u4e00-\u9fff]+)|([A-Za-z0-9]+)|([^A-Za-z0-9\u4e00-\u9fff])/g) || []
    
    return segments.map(seg => {
      // 中文段落：使用分词处理
      if (/^[\u4e00-\u9fff]+$/.test(seg)) {
        return processChineseText(seg, ratio, ignoreShort)
      }
      // 英文/数字：使用英文处理
      if (/^[A-Za-z0-9]+$/.test(seg)) {
        return processEnglishWord(seg, ratio, ignoreShort)
      }
      // 其他字符（标点、空格、换行等）：保持原样
      return seg
    }).join('')
  }

  // 复制富文本到剪贴板
  async function handleCopy() {
    const html = processText(text)
    
    // 方法1：使用现代 Clipboard API（支持富文本）
    try {
      const htmlBlob = new Blob([html], { type: 'text/html' })
      const textBlob = new Blob([text], { type: 'text/plain' })
      const clipboardItem = new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob
      })
      await navigator.clipboard.write([clipboardItem])
      alert('Copied rich text to clipboard!')
      return
    } catch (err) {
      console.log('Clipboard API failed, trying fallback:', err)
    }
    
    // 方法2：使用 execCommand 降级方案
    try {
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = html
      tempDiv.style.position = 'fixed'
      tempDiv.style.left = '-9999px'
      tempDiv.style.whiteSpace = 'pre-wrap'
      document.body.appendChild(tempDiv)
      
      const range = document.createRange()
      range.selectNodeContents(tempDiv)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      
      document.execCommand('copy')
      selection.removeAllRanges()
      document.body.removeChild(tempDiv)
      
      alert('Copied rich text to clipboard!')
      return
    } catch (err) {
      console.log('execCommand fallback failed:', err)
    }
    
    // 方法3：最后降级为纯文本
    try {
      await navigator.clipboard.writeText(text)
      alert('Copied as plain text (rich text not supported in this browser)')
    } catch (err) {
      alert('Failed to copy. Please select and copy manually.')
    }
  }

  const outputStyle = {
    fontSize: `${fontSize}px`,
    lineHeight: lineHeight,
    '--fade-opacity': fadeOpacity
  }

  return (
    <div className="container">
      <h1>Bionic Reader</h1>
      <p className="subtitle">Enhance reading focus with smart fixation points · 支持中英文混合文本</p>
      
      <div className="controls">
        <div className="control-row">
          <label>Bold Ratio: {ratio}</label>
          <input
            type="range"
            min="0.2"
            max="0.8"
            step="0.1"
            value={ratio}
            onChange={(e) => setRatio(parseFloat(e.target.value))}
          />
        </div>
        
        <div className="control-row">
          <label>Ignore Short Words (≤3):</label>
          <input
            type="checkbox"
            checked={ignoreShort}
            onChange={(e) => setIgnoreShort(e.target.checked)}
          />
        </div>
        
        <div className="control-row">
          <label>Font Size: {fontSize}px</label>
          <input
            type="range"
            min="14"
            max="28"
            step="2"
            value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value))}
          />
        </div>
        
        <div className="control-row">
          <label>Line Height: {lineHeight}</label>
          <input
            type="range"
            min="1.2"
            max="2.5"
            step="0.1"
            value={lineHeight}
            onChange={(e) => setLineHeight(parseFloat(e.target.value))}
          />
        </div>
        
        <div className="control-row">
          <label>Fade Opacity: {fadeOpacity}</label>
          <input
            type="range"
            min="0.2"
            max="0.8"
            step="0.1"
            value={fadeOpacity}
            onChange={(e) => setFadeOpacity(parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="input-section">
        <div className="file-upload">
          <label className={`file-label ${isLoading ? 'loading' : ''}`}>
            <input
              type="file"
              accept=".txt,.pdf"
              onChange={handleFileUpload}
              className="file-input"
              disabled={isLoading}
            />
            {isLoading ? 'Processing...' : 'Upload TXT / PDF'}
          </label>
          {fileName && (
            <span className="file-name">{fileName}</span>
          )}
          {text && (
            <button className="clear-btn" onClick={handleClear}>
              Clear
            </button>
          )}
        </div>
        
        <textarea
          placeholder="粘贴中文或英文文本，或上传 .txt / .pdf 文件..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="output-container">
        <h2>Reading Output</h2>
        <div
          className="output"
          style={outputStyle}
          dangerouslySetInnerHTML={{ __html: processText(text) }}
        />
      </div>

      {text && (
        <button className="copy-btn" onClick={handleCopy}>
          Copy Rich Text
        </button>
      )}
    </div>
  )
}

export default App
