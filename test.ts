// MakeCode API smoke test. Run on a micro:bit V2 with IR receiver connected to P0.
electrokitIR.connect(DigitalPin.P0)
electrokitIR.setReleaseTimeout(350)
electrokitIR.onButtonPressed(ElectrokitButton.Any, function () {
    serial.writeLine("pressed " + electrokitIR.lastCommand())
})
electrokitIR.onButtonReleased(ElectrokitButton.Any, function () {
    serial.writeLine("released " + electrokitIR.lastReleasedButton())
})
basic.forever(function () {
    if (electrokitIR.isHeld(ElectrokitButton.Up)) {
        led.plot(2, 0)
    } else {
        led.unplot(2, 0)
    }
    if (electrokitIR.heldFor(ElectrokitButton.Up, 1000)) {
        led.plot(2, 1)
    } else {
        led.unplot(2, 1)
    }
    serial.writeLine("held=" + electrokitIR.holdDuration() + " presses=" + electrokitIR.pressCount())
    basic.pause(250)
})
