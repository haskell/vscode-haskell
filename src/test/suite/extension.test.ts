import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as haskell from '../../extension';

function getExtension(extId: string) {
  return vscode.extensions.getExtension(extId);
}

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(getExtension('haskell.haskell'));
  });

  test('should activate', () => {
    getExtension('justusadam.language-haskell')
      ?.activate()
      .then(() => {
        getExtension('haskell.haskell')
          ?.activate()
          .then(() => {
            assert.ok(true);
          });
      });
  });
});
