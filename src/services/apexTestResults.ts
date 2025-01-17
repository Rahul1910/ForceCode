import * as vscode from 'vscode';
import * as forceCode from '../forceCode';
import { codeCovViewService, FCFile, getVSCodeSetting } from '.';
import { QueryResult } from 'jsforce';
import { getSrcDir, VSCODE_SETTINGS } from './configuration';
import * as path from 'path';

export function getApexTestResults(singleClass?: boolean): Promise<QueryResult> {
  let fromWhere: string = singleClass ? ' ApexCodeCoverage ' : ' ApexCodeCoverageAggregate ';
  let selectMore = singleClass ? 'TestMethodName, ApexTestClassId, ApexTestClass.Name,' : '';
  let query =
    `SELECT ${selectMore} Coverage, ApexClassOrTrigger.Name, ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered ` +
    'FROM' +
    fromWhere +
    'WHERE (NumLinesCovered > 0 OR NumLinesUncovered > 0) ' +
    `ORDER BY ApexClassOrTrigger.Name${singleClass ? ', TestMethodName' : ''} ASC`;

  return vscode.window.forceCode.conn.tooling.query(query).then(updateCoverage);

  // =======================================================================================================================================
  function updateCoverage(res: QueryResult): QueryResult {
    // Add Line Coverage information
    if (res.records) {
      let highestCov: number = 0;
      let highestClass: FCFile | undefined;
      res.records.forEach((curRes: forceCode.ICodeCoverage) => {
        let thePath = '';
        let className = curRes.ApexClassOrTrigger?.Name;
        if (!className || className == null) {
          // skip the current result
          return;
        }
        // 01p is an ApexClass, 01q is a trigger
        if (curRes.ApexClassOrTriggerId.startsWith('01p')) {
          // we have a class
          thePath = path.join(getSrcDir(), 'classes', className + '.cls');
        } else {
          // we have a trigger
          thePath = path.join(getSrcDir(), 'triggers', className + '.trigger');
        }
        const fcfile: FCFile | undefined = codeCovViewService.findByPath(thePath);
        if (fcfile && curRes.NumLinesUncovered === curRes.Coverage.uncoveredLines.length) {
          fcfile.setCoverageTestClass('overall');
          if (curRes.ApexTestClass?.Name) {
            fcfile.addCoverage(curRes.ApexTestClass.Name + '.' + curRes.TestMethodName, curRes);
          } else {
            fcfile.addCoverage('overall', curRes);
          }
          let total: number = curRes.NumLinesCovered + curRes.NumLinesUncovered;
          let percent = Math.floor((curRes.NumLinesCovered / total) * 100);
          if (percent > highestCov) {
            highestCov = percent;
            highestClass = fcfile;
          }
        }
      });

      if (singleClass && highestClass && getVSCodeSetting(VSCODE_SETTINGS.revealTestedClass)) {
        // reveal the tested class
        let treePro = vscode.window.createTreeView('ForceCode.codeCovDataProvider', {
          treeDataProvider: codeCovViewService,
        });
        treePro.reveal(highestClass);
      }
    }

    return res;
  }
}
