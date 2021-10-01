import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as haskell from '../../extension';

function getExtension() {
  return vscode.extensions.getExtension('haskell.haskell');
}

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(getExtension());
  });

  test('should activate', () => {
    return vscode.extensions
      .getExtension('haskell.haskell')
      ?.activate()
      .then(() => {
        assert.ok(true);
      });
  });
});
