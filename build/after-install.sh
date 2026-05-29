#!/bin/bash
# USB printer uchun udev qoidasi o'rnatish
echo 'KERNEL=="lp[0-9]*", SUBSYSTEM=="usb", MODE="0666"' > /etc/udev/rules.d/99-afisant-printer.rules
udevadm control --reload-rules
udevadm trigger
