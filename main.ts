/** Buttons on the 17-key Electrokit IR remote (number pad above arrows). */
//% blockNamespace=electrokitIR
const enum ElectrokitButton {
    //% block="any"
    Any = -1,
    //% block="1"
    One = 0xA2,
    //% block="2"
    Two = 0x62,
    //% block="3"
    Three = 0xE2,
    //% block="4"
    Four = 0x22,
    //% block="5"
    Five = 0x02,
    //% block="6"
    Six = 0xC2,
    //% block="7"
    Seven = 0xE0,
    //% block="8"
    Eight = 0xA8,
    //% block="9"
    Nine = 0x90,
    //% block="*"
    Star = 0x68,
    //% block="0"
    Zero = 0x98,
    //% block="#"
    Hash = 0xB0,
    //% block="up"
    Up = 0x18,
    //% block="left"
    Left = 0x10,
    //% block="OK"
    OK = 0x38,
    //% block="right"
    Right = 0x5A,
    //% block="down"
    Down = 0x4A
}

//% color=#008B9A icon="\uf1eb" block="Electrokit IR"
//% groups='["Setup", "Conditions", "Events", "Timing", "Information", "Advanced"]'
namespace electrokitIR {
    let started = false
    let lastCode = -1
    let activeCode = -1
    let lastSeen = 0
    let lastRepeatAt = 0
    let lastFullAt = 0
    let dbgRestored = 0
    let releaseDelay = 300
    let lastPressedAt = -1
    let lastReleasedAt = -1
    let lastReleasedCode = -1
    let pressCounter = 0
    let releaseCounter = 0
    let repeatCounter = 0
    let activeSince = -1
    let previousActiveSince = -1
    let handlers: ButtonHandler[] = []
    let releaseHandlers: ButtonHandler[] = []
    let bitsReceived = 0
    let addressBits = 0
    let commandBits = 0
    let pulseMark = 0
    let rawFrame = "0x00000000"
    // Diagnostic counters. Read via debugSnapshot(); never print inside pulse interrupts.
    let dbgLow = 0
    let dbgHigh = 0
    let dbgFull = 0
    let dbgRepeat = 0
    let dbgInvalid = 0
    let dbgLong = 0
    let dbgLastLow = 0
    let dbgLastHigh = 0
    let dbgLastPair = 0
    let dbgLastLong = 0
    let dbgMaxPair = 0
    class ButtonHandler {
        button: ElectrokitButton
        callback: () => void
        constructor(button: ElectrokitButton, callback: () => void) {
            this.button = button
            this.callback = callback
        }
    }
    function releaseActive(): void {
        if (activeCode < 0) return
        const old = activeCode
        activeCode = -1
        lastReleasedCode = old
        lastReleasedAt = input.runningTime()
        releaseCounter++
        previousActiveSince = activeSince
        activeSince = -1
        for (let i = 0; i < releaseHandlers.length; i++) {
            const h = releaseHandlers[i]
            if (h.button === ElectrokitButton.Any || h.button === old) {
                control.inBackground(h.callback)
            }
        }
    }
    function onCompleteFrame(): void {
        const command = (commandBits >> 8) & 0xff
        const inverse = commandBits & 0xff
        if ((command ^ inverse) !== 0xff) {
            dbgInvalid++
            return
        }
        dbgFull++
        rawFrame = "0x" + toHex16(addressBits) + toHex16(commandBits)
        lastCode = command
        lastSeen = input.runningTime()
        lastFullAt = lastSeen
        if (activeCode !== command) {
            releaseActive()
            activeCode = command
            activeSince = lastSeen
            lastPressedAt = lastSeen
            pressCounter++
            for (let i = 0; i < handlers.length; i++) {
                const h = handlers[i]
                if (h.button === ElectrokitButton.Any || h.button === command) {
                    control.inBackground(h.callback)
                }
            }
        }
    }
    function toHex16(n: number): string {
        let result = ""
        for (let i = 0; i < 4; i++) {
            const digit = n & 15
            result = "0123456789ABCDEF".charAt(digit) + result
            n = n >> 4
        }
        return result
    }
    function decodePulse(duration: number): void {
        if (duration < 1600) {
            appendBit(0)
        } else if (duration < 2700) {
            appendBit(1)
        } else {
            bitsReceived = 0
            dbgLong++
            dbgLastLong = duration
            if (duration >= 9500 && duration < 12500) {
                dbgRepeat++
                // NEC repeat leader: 9 ms mark + 2.25 ms space.
                const now = input.runningTime()
                // A repeat is only valid close to the preceding full/repeat frame.
                // Some runtimes can mark a button released while repeats are
                // still arriving; recover the state from the last full command.
                if (lastCode >= 0 && now - lastSeen < 450) {
                    lastSeen = now
                    lastRepeatAt = now
                    repeatCounter++
                    if (activeCode < 0) {
                        activeCode = lastCode
                        activeSince = now
                        lastPressedAt = now
                        pressCounter++
                        dbgRestored++
                    }
                }
            }
            // 13.5 ms is the start of a full NEC frame.
        }
    }
    function appendBit(bit: number): void {
        bitsReceived++
        if (bitsReceived <= 16) {
            addressBits = ((addressBits << 1) | bit) & 0xffff
        } else if (bitsReceived <= 32) {
            commandBits = ((commandBits << 1) | bit) & 0xffff
        }
        if (bitsReceived === 32) {
            bitsReceived = 0
            onCompleteFrame()
        }
    }
    /** Connect the NEC IR receiver. Do not connect another IR decoder to the same pin. */
    //% blockId=electrokit_ir_connect block="connect Electrokit IR receiver to pin %pin"
    //% pin.defl=DigitalPin.P0
    //% group="Setup"
    //% weight=100
    export function connect(pin: DigitalPin): void {
        if (started) return
        started = true
        pins.setPull(pin, PinPullMode.PullNone)
        pins.onPulsed(pin, PulseValue.Low, function () {
            pulseMark = pins.pulseDuration()
            dbgLow++
            dbgLastLow = pulseMark
        })
        pins.onPulsed(pin, PulseValue.High, function () {
            const space = pins.pulseDuration()
            dbgHigh++
            dbgLastHigh = space
            dbgLastPair = pulseMark + space
            if (dbgLastPair > dbgMaxPair) dbgMaxPair = dbgLastPair
            decodePulse(dbgLastPair)
        })
        basic.forever(function () {
            if (activeCode >= 0 && input.runningTime() - lastSeen > releaseDelay) {
                releaseActive()
            }
            basic.pause(25)
        })
    }
    /** Run when a remote button is pressed. */
    //% blockId=electrokit_ir_on_button block="on Electrokit button %button pressed"
    //% button.fieldEditor="gridpicker"
    //% button.fieldOptions.columns=3
    //% group="Events"
    //% weight=90
    export function onButtonPressed(button: ElectrokitButton, callback: () => void): void {
        handlers.push(new ButtonHandler(button, callback))
    }


    /** Convert a remote command into its printed key label. Returns "-" when no key is known. */
    function keyLabel(code: number): string {
        switch (code) {
            case 0xA2: return "1"
            case 0x62: return "2"
            case 0xE2: return "3"
            case 0x22: return "4"
            case 0x02: return "5"
            case 0xC2: return "6"
            case 0xE0: return "7"
            case 0xA8: return "8"
            case 0x90: return "9"
            case 0x68: return "*"
            case 0x98: return "0"
            case 0xB0: return "#"
            case 0x18: return "↑"
            case 0x10: return "←"
            case 0x38: return "✓"
            case 0x5A: return "→"
            case 0x4A: return "↓"
            default: return "-"
        }
    }

    /** Name of the button currently held: "↑", "✓", "1", etc.; "-" when idle. */
    //% blockId=electrokit_ir_active_button_name block="active Electrokit button name"
    //% group="Information"
    //% weight=99
    export function activeButtonName(): string {
        const now = input.runningTime()
        if (activeCode < 0 || now - lastSeen > releaseDelay) return "-"
        return keyLabel(activeCode)
    }

    /** Name of the last button pressed, even after release. */
    //% blockId=electrokit_ir_last_button_name block="last Electrokit button name"
    //% group="Information"
    //% weight=98
    export function lastButtonName(): string {
        return keyLabel(lastCode)
    }

    /** Name of the last button released. */
    //% blockId=electrokit_ir_released_button_name block="last released Electrokit button name"
    //% group="Information"
    //% weight=97
    export function lastReleasedButtonName(): string {
        return keyLabel(lastReleasedCode)
    }

    /** Display label of a chosen remote key. */
    //% blockId=electrokit_ir_button_name block="Electrokit button %button name"
    //% group="Information"
    //% weight=96
    export function buttonName(button: ElectrokitButton): string {
        return keyLabel(button)
    }

    // The LED matrix cannot reliably render Unicode arrows or a check mark via showString.
    // Render these keys using native 5x5 images instead.
    let displayedKey = -2

    /** Show a selected button as one static 5x5 LED symbol. */
    //% blockId=electrokit_ir_show_button_symbol block="show Electrokit button %button symbol"
    //% group="Information"
    //% weight=95
    export function showButtonSymbol(button: ElectrokitButton): void {
        if (button === ElectrokitButton.Up) {
            basic.showArrow(ArrowNames.North)
        } else if (button === ElectrokitButton.Down) {
            basic.showArrow(ArrowNames.South)
        } else if (button === ElectrokitButton.Left) {
            basic.showArrow(ArrowNames.West)
        } else if (button === ElectrokitButton.Right) {
            basic.showArrow(ArrowNames.East)
        } else if (button === ElectrokitButton.OK) {
            basic.showIcon(IconNames.Yes)
        } else if (button === ElectrokitButton.Star) {
            basic.showLeds(`
                . . # . .
                # . # . #
                . # # # .
                # . # . #
                . . # . .
            `)
        } else if (button === ElectrokitButton.Hash) {
            basic.showLeds(`
                . # . # .
                # # # # #
                . # . # .
                # # # # #
                . # . # .
            `)
        } else if (button >= 0) {
            basic.showString(keyLabel(button))
        } else {
            basic.clearScreen()
        }
    }

    /** Show the currently held button as a static symbol; clear on release.
     * Call this repeatedly inside forever. Only redraws when the button changes.
     */
    //% blockId=electrokit_ir_show_active_symbol block="show held Electrokit button symbol"
    //% group="Information"
    //% weight=94
    export function showActiveButtonSymbol(): void {
        const now = input.runningTime()
        const key = (activeCode >= 0 && now - lastSeen <= releaseDelay) ? activeCode : -1
        if (key !== displayedKey) {
            displayedKey = key
            showButtonSymbol(key as ElectrokitButton)
        }
    }

    /** Most recently received button command (-1 before first reception). */
    //% blockId=electrokit_ir_last_button block="last Electrokit button code"
    //% group="Information"
    //% weight=85
    export function lastButton(): number {
        return lastCode
    }

    /** True while a button is considered held (based on recent IR frames). */
    //% blockId=electrokit_ir_is_held block="Electrokit button %button is held"
    //% group="Conditions"
    //% weight=95
    export function isHeld(button: ElectrokitButton): boolean {
        const now = input.runningTime()
        if (now - lastSeen > releaseDelay) return false
        // Repeat frames can arrive after a premature release transition.
        const code = activeCode >= 0 ? activeCode : lastCode
        if (code < 0) return false
        return button === ElectrokitButton.Any || code === button
    }

    /** Fires when no IR frame has arrived for the release timeout. This is an estimated release, not a physical release signal. */
    //% blockId=electrokit_ir_on_released block="on Electrokit button %button released (estimated)"
    //% group="Events"
    //% weight=85
    export function onButtonReleased(button: ElectrokitButton, callback: () => void): void {
        releaseHandlers.push(new ButtonHandler(button, callback))
    }

    /** Release timeout in milliseconds (100..1000). */
    //% blockId=electrokit_ir_timeout block="set IR release timeout to %ms ms"
    //% ms.min=100 ms.max=1000 ms.defl=300
    //% group="Setup"
    //% weight=90
    export function setReleaseTimeout(ms: number): void {
        releaseDelay = Math.max(100, Math.min(1000, ms))
    }

    /** Returns the most recent NEC command, or -1 before receiving one. */
    //% blockId=electrokit_ir_last_command block="last Electrokit IR command"
    //% group="Information"
    //% weight=70
    export function lastCommand(): number {
        return lastCode
    }

    /** Returns the 32-bit NEC frame as a hexadecimal string. */
    //% blockId=electrokit_ir_raw_code block="last Electrokit IR hex code"
    //% group="Information"
    //% weight=60
    export function rawCode(): string {
        return rawFrame
    }

    /** Returns the NEC command for a selected physical button. */
    //% blockId=electrokit_ir_button_code block="Electrokit button %button command"
    //% button.fieldEditor="gridpicker"
    //% button.fieldOptions.columns=3
    //% group="Information"
    //% weight=50
    export function buttonCode(button: ElectrokitButton): number {
        return button as number
    }

    /** True if no remote button is currently held. Useful for stopping a robot. */
    //% blockId=electrokit_ir_idle block="Electrokit remote is idle"
    //% group="Conditions" weight=90
    export function isIdle(): boolean {
        return !isHeld(ElectrokitButton.Any)
    }

    /** True if the selected button was pressed during the last window milliseconds. Does not consume the press. */
    //% blockId=electrokit_ir_pressed_recently block="Electrokit button $button pressed within $window ms"
    //% window.min=50 window.max=10000 window.defl=500
    //% group="Conditions" weight=80
    export function pressedRecently(button: ElectrokitButton, window: number): boolean {
        if (lastPressedAt < 0 || input.runningTime() - lastPressedAt > window) return false
        return button === ElectrokitButton.Any || lastCode === button
    }

    /** True if the selected button was released during the last window milliseconds. Does not consume the release. */
    //% blockId=electrokit_ir_released_recently block="Electrokit button $button released within $window ms"
    //% window.min=50 window.max=10000 window.defl=500
    //% group="Conditions" weight=75
    export function releasedRecently(button: ElectrokitButton, window: number): boolean {
        if (lastReleasedAt < 0 || input.runningTime() - lastReleasedAt > window) return false
        return button === ElectrokitButton.Any || lastReleasedCode === button
    }

    /** True if a button has been held continuously for at least the specified duration. */
    //% blockId=electrokit_ir_held_for block="Electrokit button $button held for at least $ms ms"
    //% ms.min=0 ms.max=60000 ms.defl=1000
    //% group="Conditions" weight=70
    export function heldFor(button: ElectrokitButton, ms: number): boolean {
        return isHeld(button) && activeSince >= 0 && input.runningTime() - activeSince >= ms
    }

    /** Number of milliseconds the currently held button has been active; zero if idle. */
    //% blockId=electrokit_ir_hold_duration block="Electrokit hold duration (ms)"
    //% group="Timing" weight=90
    export function holdDuration(): number {
        if (!isHeld(ElectrokitButton.Any) || activeSince < 0) return 0
        return input.runningTime() - activeSince
    }

    /** Milliseconds since the most recent valid press; -1 if none. */
    //% blockId=electrokit_ir_since_press block="time since last Electrokit press (ms)"
    //% group="Timing" weight=80
    export function timeSincePress(): number {
        return lastPressedAt < 0 ? -1 : input.runningTime() - lastPressedAt
    }

    /** Milliseconds since the most recent estimated release; -1 if none. */
    //% blockId=electrokit_ir_since_release block="time since last Electrokit release (ms)"
    //% group="Timing" weight=70
    export function timeSinceRelease(): number {
        return lastReleasedAt < 0 ? -1 : input.runningTime() - lastReleasedAt
    }

    /** Last button that was released, as an NEC command (-1 if none). */
    //% blockId=electrokit_ir_last_released block="last released Electrokit button code"
    //% group="Information" weight=55
    export function lastReleasedButton(): number {
        return lastReleasedCode
    }

    /** NEC command of the currently active button, or -1 when idle. */
    //% blockId=electrokit_ir_active_code block="active Electrokit button code"
    //% group="Information" weight=90
    export function activeButton(): number {
        return isHeld(ElectrokitButton.Any) ? activeCode : -1
    }

    /** True after connect has been called. Does not mean an IR signal is present. */
    //% blockId=electrokit_ir_connected block="Electrokit receiver initialized"
    //% group="Conditions" weight=60
    export function isConnected(): boolean {
        return started
    }

    /** True if a valid NEC full or repeat frame arrived recently. */
    //% blockId=electrokit_ir_signal_recent block="Electrokit signal received within $ms ms"
    //% ms.min=50 ms.max=10000 ms.defl=500
    //% group="Conditions" weight=55
    export function signalRecently(ms: number): boolean {
        return lastCode >= 0 && input.runningTime() - lastSeen <= ms
    }

    /** Number of recognized presses since startup or counter reset. */
    //% blockId=electrokit_ir_press_count block="Electrokit press count"
    //% group="Advanced" weight=70 advanced=true
    export function pressCount(): number { return pressCounter }

    /** Number of estimated releases since startup or counter reset. */
    //% blockId=electrokit_ir_release_count block="Electrokit release count"
    //% group="Advanced" weight=65 advanced=true
    export function releaseCount(): number { return releaseCounter }

    /** Number of valid NEC repeat frames attributed to a button. */
    //% blockId=electrokit_ir_repeat_count block="Electrokit repeat count"
    //% group="Advanced" weight=60 advanced=true
    export function repeatCount(): number { return repeatCounter }

    /** Reset statistics counters without changing the active button. */
    //% blockId=electrokit_ir_reset_counters block="reset Electrokit counters"
    //% group="Advanced" weight=55 advanced=true
    export function resetCounters(): void {
        pressCounter = 0
        releaseCounter = 0
        repeatCounter = 0
    }

    /** Configured release timeout in milliseconds. */
    //% blockId=electrokit_ir_get_timeout block="Electrokit release timeout (ms)"
    //% group="Timing" weight=60
    export function releaseTimeout(): number { return releaseDelay }

}
