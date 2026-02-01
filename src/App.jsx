import { useState } from 'react'

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

// 计算最佳加粗长度
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

function App() {
  const [text, setText] = useState('')
  const [ratio, setRatio] = useState(0.5)
  const [ignoreShort, setIgnoreShort] = useState(false)
  const [fontSize, setFontSize] = useState(18)
  const [lineHeight, setLineHeight] = useState(1.8)
  const [fileName, setFileName] = useState('')

  // 处理文件上传
  function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    // 检查文件类型
    if (!file.name.endsWith('.txt')) {
      alert('Please upload a .txt file')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      setText(event.target.result)
      setFileName(file.name)
    }
    reader.onerror = () => {
      alert('Failed to read file')
    }
    reader.readAsText(file)
  }

  // 清除文件和文本
  function handleClear() {
    setText('')
    setFileName('')
  }

  // 处理文本，使用改进的启发式算法
  function processText(input) {
    if (!input) return ''
    
    return input.replace(/[A-Za-z0-9]+/g, (word) => {
      // 如果启用忽略短词且单词长度 <= 3，不加粗
      if (ignoreShort && word.length <= 3) {
        return word
      }
      // 使用改进的算法计算加粗长度
      const boldLen = getBoldLength(word, ratio)
      const boldPart = word.substring(0, boldLen)
      const restPart = word.substring(boldLen)
      return `<strong>${boldPart}</strong>${restPart}`
    })
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
    lineHeight: lineHeight
  }

  return (
    <div className="container">
      <h1>Bionic Reader</h1>
      <p className="subtitle">Enhance reading focus with smart fixation points at natural word boundaries</p>
      
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
      </div>

      <div className="input-section">
        <div className="file-upload">
          <label className="file-label">
            <input
              type="file"
              accept=".txt"
              onChange={handleFileUpload}
              className="file-input"
            />
            Upload TXT File
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
          placeholder="Paste your English text here or upload a .txt file..."
          value={text}
          onChange={(e) => setText(e.target.value)}
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
