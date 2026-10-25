import net from 'node:net'
import tls from 'node:tls'

/** Synthetic SMTP sink. It never relays mail and refuses AUTH before verified TLS. */
export async function startSmtpFixture({ key, cert, username, password, implicit = false, advertiseTls = true }) {
  const messages = []
  const sockets = new Set()
  const context = tls.createSecureContext({ key, cert })
  function attach(socket, greeting = true) {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    let buffer = '', body = '', inData = false, authenticated = false
    const onData = chunk => {
      buffer += chunk.toString()
      let end
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2)
        if (inData) {
          if (line === '.') { messages.push(body); body = ''; inData = false; socket.write('250 Message accepted\r\n') }
          else body += line.replace(/^\.\./, '.') + '\r\n'
          continue
        }
        const [verb, ...args] = line.split(' ')
        if (verb === 'EHLO' || verb === 'HELO') {
          const capabilities = ['localhost', ...(!socket.encrypted && advertiseTls ? ['STARTTLS'] : []), ...(socket.encrypted ? ['AUTH PLAIN'] : [])]
          socket.write(capabilities.map((v, i) => `250${i === capabilities.length - 1 ? ' ' : '-'}${v}\r\n`).join(''))
        } else if (verb === 'STARTTLS' && advertiseTls && !socket.encrypted) {
          socket.write('220 Upgrade to TLS\r\n')
          socket.removeListener('data', onData)
          attach(new tls.TLSSocket(socket, { isServer: true, secureContext: context }), false)
          return
        } else if (verb === 'AUTH') {
          const [, user, pass] = Buffer.from(args[1] || '', 'base64').toString().split('\0')
          authenticated = Boolean(socket.encrypted && user === username && pass === password)
          socket.write(authenticated ? '235 Authenticated\r\n' : '535 Authentication failed\r\n')
        } else if (verb === 'MAIL' || verb === 'RCPT') socket.write(authenticated ? '250 OK\r\n' : '530 Authentication required\r\n')
        else if (verb === 'DATA' && authenticated) { inData = true; socket.write('354 Send message\r\n') }
        else if (verb === 'QUIT') { socket.end('221 Bye\r\n') }
        else if (verb === 'RSET' || verb === 'NOOP') socket.write('250 OK\r\n')
        else socket.write('502 Not supported\r\n')
      }
    }
    socket.on('data', onData)
    if (greeting) socket.write('220 localhost synthetic test sink\r\n')
  }
  const server = implicit ? tls.createServer({ key, cert }, s => attach(s)) : net.createServer(s => attach(s))
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return { messages, port: server.address().port, close: () => new Promise(resolve => { for (const s of sockets) s.destroy(); server.close(resolve) }) }
}
