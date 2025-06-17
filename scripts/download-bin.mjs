// scripts/download.js

import https from 'https'
import fs from 'fs'
import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'
import unzipper from 'unzipper'
import tar from 'tar'
import { copySync } from 'cpx'

console.log('Script is running')

/* =============================
    Função de download
============================= */
function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url} to ${dest}`)
    const file = fs.createWriteStream(dest)

    https.get(url, (response) => {
      const { statusCode, headers } = response

      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        // Redirecionamento
        console.log(`Redirecting to ${headers.location}`)
        download(headers.location, dest).then(resolve, reject)
        return
      }

      if (statusCode !== 200) {
        reject(new Error(`Failed to download '${url}' (Status: ${statusCode})`))
        return
      }

      response.pipe(file)
      file.on('finish', () => file.close(resolve))
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err))
    })
  })
}

/* =============================
    Função de descompressão
============================= */
async function decompress(filePath, targetDir) {
  console.log(`Decompressing ${filePath} to ${targetDir}`)
  if (filePath.endsWith('.zip')) {
    await fs.createReadStream(filePath)
      .pipe(unzipper.Extract({ path: targetDir }))
      .promise()
  } else if (filePath.endsWith('.tar.gz')) {
    await tar.x({ file: filePath, cwd: targetDir })
  } else {
    throw new Error(`Unsupported archive format: ${filePath}`)
  }
}

/* =============================
    Detectar plataforma
============================= */
function getPlatformArch() {
  const platform = os.platform()
  const arch = os.arch()

  let bunPlatform, uvPlatform

  if (platform === 'darwin') {
    bunPlatform = arch === 'arm64' ? 'darwin-aarch64' : 'darwin-x86'
    uvPlatform = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
  } else if (platform === 'linux') {
    bunPlatform = arch === 'arm64' ? 'linux-aarch64' : 'linux-x64'
    uvPlatform = arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu'
  } else if (platform === 'win32') {
    bunPlatform = 'windows-x64'
    uvPlatform = 'x86_64-pc-windows-msvc'
  } else {
    throw new Error(`Unsupported platform: ${platform}`)
  }

  return { bunPlatform, uvPlatform, platform }
}

/* =============================
    Copiar binários e setar permissões
============================= */
async function copyAndPrepareBinary(srcDir, binName, binDir, suffixes = []) {
  const src = path.join(srcDir, binName)
  const dest = path.join(binDir, binName)

  try {
    copySync(src, dest)
    if (!dest.endsWith('.exe')) {
      await fsPromises.chmod(dest, 0o755)
    }
    console.log(`Copied ${binName} to ${dest}`)
  } catch (err) {
    console.warn(`Failed to copy ${binName}:`, err)
  }

  for (const suffix of suffixes) {
    const destSuffix = `${binName}${suffix}`
    try {
      await fsPromises.copyFile(dest, path.join(binDir, destSuffix))
      console.log(`Copied ${dest} to ${destSuffix}`)
    } catch (err) {
      console.warn(`Failed to copy ${dest} to ${destSuffix}:`, err)
    }
  }
}

/* =============================
    Main
============================= */
async function main() {
  const { bunPlatform, uvPlatform, platform } = getPlatformArch()

  const binDir = 'src-tauri/resources/bin'
  const tempBinDir = 'scripts/dist'

  const bunFile = `bun-${bunPlatform}.zip`
  const uvFile = platform === 'win32'
    ? `uv-${uvPlatform}.zip`
    : `uv-${uvPlatform}.tar.gz`

  const bunPath = path.join(tempBinDir, bunFile)
  const uvPath = path.join(tempBinDir, uvFile)

  const bunVersion = '1.2.10'
  const uvVersion = '0.6.17'

  const bunUrl = `https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/${bunFile}`
  const uvUrl = `https://github.com/astral-sh/uv/releases/download/${uvVersion}/${uvFile}`

  // Cria diretórios
  fs.mkdirSync(tempBinDir, { recursive: true })
  fs.mkdirSync(binDir, { recursive: true })

  // Download e extração do Bun
  if (!fs.existsSync(bunPath)) {
    await download(bunUrl, bunPath)
    await decompress(bunPath, tempBinDir)
  }

  // Download e extração do UV
  if (!fs.existsSync(uvPath)) {
    await download(uvUrl, uvPath)
    await decompress(uvPath, tempBinDir)
  }

  // Copiar e ajustar Bun
  const bunSourceDir = path.join(tempBinDir, `bun-${bunPlatform}`)
  await copyAndPrepareBinary(
    bunSourceDir,
    platform === 'win32' ? 'bun.exe' : 'bun',
    binDir,
    platform === 'darwin' ? [
      '-x86_64-apple-darwin',
      '-aarch64-apple-darwin'
    ] : platform === 'linux' ? [
      '-x86_64-unknown-linux-gnu'
    ] : platform === 'win32' ? [
      '-x86_64-pc-windows-msvc.exe'
    ] : []
  )

  // Copiar e ajustar UV
  const uvSourceDir = path.join(tempBinDir, `uv-${uvPlatform}`)
  await copyAndPrepareBinary(
    uvSourceDir,
    platform === 'win32' ? 'uv.exe' : 'uv',
    binDir,
    platform === 'darwin' ? [
      '-x86_64-apple-darwin',
      '-aarch64-apple-darwin'
    ] : platform === 'linux' ? [
      '-x86_64-unknown-linux-gnu'
    ] : platform === 'win32' ? [
      '-x86_64-pc-windows-msvc.exe'
    ] : []
  )

  console.log('All downloads and preparations completed.')
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
