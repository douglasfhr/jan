console.log('🚀 Script is running')

import https from 'https'
import fs from 'fs'
import { copyFileSync, mkdirSync, existsSync, chmodSync } from 'fs'
import os from 'os'
import path from 'path'
import unzipper from 'unzipper'
import tar from 'tar'
import { copySync } from 'cpx'

// Funções Utilitárias
/** Baixa um arquivo */
function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`⬇️  Downloading ${url} → ${dest}`)
    const file = fs.createWriteStream(dest)

    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log(`🔀 Redirecting to ${response.headers.location}`)
        download(response.headers.location, dest).then(resolve, reject)
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`❌ Failed to download '${url}' (${response.statusCode})`))
        return
      }

      response.pipe(file)
      file.on('finish', () => {
        file.close(resolve)
      })
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err))
    })
  })
}

/** Descomprime arquivos ZIP ou TAR.GZ */
async function decompress(filePath, targetDir) {
  console.log(`📦 Decompressing ${filePath} → ${targetDir}`)
  if (filePath.endsWith('.zip')) {
    await fs.createReadStream(filePath).pipe(unzipper.Extract({ path: targetDir })).promise()
  } else if (filePath.endsWith('.tar.gz')) {
    await tar.x({ file: filePath, cwd: targetDir })
  } else {
    throw new Error(`❌ Unsupported archive format: ${filePath}`)
  }
}

/** Detecta plataforma e arquitetura */
function getPlatformArch() {
  const platform = os.platform()
  const arch = os.arch()

  const platforms = {
    darwin: {
      bun: arch === 'arm64' ? 'darwin-aarch64' : 'darwin-x86',
      uv: arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
    },
    linux: {
      bun: arch === 'arm64' ? 'linux-aarch64' : 'linux-x64',
      uv: arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu'
    },
    win32: {
      bun: 'windows-x64',
      uv: 'x86_64-pc-windows-msvc'
    }
  }

  const current = platforms[platform]
  if (!current) throw new Error(`❌ Unsupported platform: ${platform}`)

  return { bunPlatform: current.bun, uvPlatform: current.uv }
}

/*Copia binário e cria aliases */
function copyBinary({ source, destination, aliases = [], executable = true }) {
  copySync(source, destination)
  if (executable) {
    try {
      chmodSync(path.join(destination, path.basename(source)), 0o755)
    } catch (err) {
      console.warn('⚠️ Failed to set execute permissions:', err)
    }
  }
  aliases.forEach(alias => {
    try {
      copyFileSync(path.join(destination, path.basename(source)), path.join(destination, alias))
    } catch (err) {
      console.warn('⚠️ Alias copy failed:', err)
    }
  })
}

// Script Principal

async function main() {
  const { bunPlatform, uvPlatform } = getPlatformArch()
  const platform = os.platform()

  const binDir = 'src-tauri/resources/bin'
  const tempDir = 'scripts/dist'

  const bunVersion = '1.2.10'
  const uvVersion = '0.6.17'

  const bunExt = 'zip'
  const uvExt = platform === 'win32' ? 'zip' : 'tar.gz'

  const bunFile = `bun-${bunPlatform}.${bunExt}`
  const uvFile = `uv-${uvPlatform}.${uvExt}`

  const bunUrl = `https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/${bunFile}`
  const uvUrl = `https://github.com/astral-sh/uv/releases/download/${uvVersion}/${uvFile}`

  const bunFilePath = path.join(tempDir, bunFile)
  const uvFilePath = path.join(tempDir, uvFile)

  mkdirSafe(tempDir)
  mkdirSafe(binDir)

  // Download e extração Bun
  if (!existsSync(bunFilePath)) {
    await download(bunUrl, bunFilePath)
    await decompress(bunFilePath, tempDir)
  }
  handleBun(binDir, tempDir, bunPlatform, platform)

  // Download e extração UV
  if (!existsSync(uvFilePath)) {
    await download(uvUrl, uvFilePath)
    await decompress(uvFilePath, tempDir)
  }
  handleUv(binDir, tempDir, uvPlatform, platform)

  console.log('✅ Downloads completed successfully.')
}

//Handlers de binários

function handleBun(binDir, tempDir, bunPlatform, platform) {
  const baseDir = path.join(tempDir, `bun-${bunPlatform}`)
  const sourceUnix = path.join(baseDir, 'bun')
  const sourceWin = path.join(baseDir, 'bun.exe')

  if (platform === 'win32') {
    copyBinary({
      source: sourceWin,
      destination: binDir,
      aliases: ['bun-x86_64-pc-windows-msvc.exe']
    })
  } else {
    copyBinary({
      source: sourceUnix,
      destination: binDir,
      aliases: [
        ...(platform === 'darwin'
          ? ['bun-x86_64-apple-darwin', 'bun-aarch64-apple-darwin']
          : ['bun-x86_64-unknown-linux-gnu'])
      ]
    })
  }

  console.log('✔️ Bun ready.')
}

function handleUv(binDir, tempDir, uvPlatform, platform) {
  const baseDir = path.join(tempDir, `uv-${uvPlatform}`)
  const sourceUnix = path.join(baseDir, 'uv')
  const sourceWin = path.join(baseDir, 'uv.exe')

  if (platform === 'win32') {
    copyBinary({
      source: sourceWin,
      destination: binDir,
      aliases: ['uv-x86_64-pc-windows-msvc.exe']
    })
  } else {
    copyBinary({
      source: sourceUnix,
      destination: binDir,
      aliases: [
        ...(platform === 'darwin'
          ? ['uv-x86_64-apple-darwin', 'uv-aarch64-apple-darwin']
          : ['uv-x86_64-unknown-linux-gnu'])
      ]
    })
  }

  console.log('✔️ UV ready.')
}

// Função para mkdir segura

function mkdirSafe(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

// Executar

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
