import { Logger } from 'tslog'

const logMsg = new Logger({ minLevel: 'INFO' })
const warnMsg = new Logger({ minLevel: 'WARN' })
const debugMsg = new Logger({ minLevel: 'DEBUG' })
const errorMsg = new Logger({ minLevel: 'ERROR' })
const traceMsg = new Logger({ minLevel: 'TRACE' })

export function log(text: string) {
	let msg = logMsg.info(text)
	return msg
}

export function warn(text: string) {
	let msg = warnMsg.warn(text)
	return msg
}

export function debug(text: string) {
	let msg = debugMsg.debug(text)
	return msg
}

export function error(text: string) {
	let msg = errorMsg.error(text)
	return msg
}

export function trace(text: string) {
	let msg = traceMsg.trace(text)
	return msg
}
