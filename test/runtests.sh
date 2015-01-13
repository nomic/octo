#!/bin/bash
TEST_DIR=${0%/*}
mocha --timeout 5000 --ui tdd --reporter spec $TEST_DIR/tests.js
