import {NodeHost} from '../../lib/ast-tools';
import {CliConfig} from '../../models/config';
import {getAppFromConfig} from '../../utilities/app-utils';

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const dynamicPathParser = require('../../utilities/dynamic-path-parser');
const stringUtils = require('ember-cli-string-utils');
const astUtils = require('../../utilities/ast-utils');
const findParentModule = require('../../utilities/find-parent-module').default;
const Blueprint = require('../../ember-cli/lib/models/blueprint');
const getFiles = Blueprint.prototype.files;

export default Blueprint.extend({
  description: '',

  availableOptions: [
    {
      name: 'flat',
      type: Boolean,
      description: 'Flag to indicate if a dir is created.'
    },
    {
      name: 'prefix',
      type: String,
      default: null,
      description: 'Specifies whether to use the prefix.'
    },
    {
      name: 'spec',
      type: Boolean,
      description: 'Specifies if a spec file is generated.'
    },
    {
      name: 'skip-import',
      type: Boolean,
      default: false,
      description: 'Allows for skipping the module import.'
    },
    {
      name: 'module',
      type: String, aliases: ['m'],
      description: 'Allows specification of the declaring module.'
    },
    {
      name: 'export',
      type: Boolean,
      default: false,
      description: 'Specifies if declaring module exports the component.'
    },
    {
      name: 'app',
      type: String,
      aliases: ['a'],
      description: 'Specifies app name to use.'
    }
  ],

  beforeInstall: function(options: any) {
    const cliConfig = CliConfig.fromProject();
    const ngConfig = cliConfig && cliConfig.config;
    const appConfig = getAppFromConfig(ngConfig.apps, this.options.app);
    if (options.module) {
      // Resolve path to module
      const modulePath = options.module.endsWith('.ts') ? options.module : `${options.module}.ts`;
      const parsedPath = dynamicPathParser(this.project, modulePath, appConfig);
      this.pathToModule = path.join(this.project.root, parsedPath.dir, parsedPath.base);

      if (!fs.existsSync(this.pathToModule)) {
        throw ' ';
      }
    } else {
      try {
        this.pathToModule = findParentModule
          (this.project.root, appConfig.root, this.dynamicPath.dir);
      } catch (e) {
        if (!options.skipImport) {
          throw `Error locating module for declaration\n\t${e}`;
        }
      }
    }
  },

  normalizeEntityName: function (entityName: string) {
    const cliConfig = CliConfig.fromProject();
    const ngConfig = cliConfig && cliConfig.config;
    const appConfig = getAppFromConfig(ngConfig.apps, this.options.app);
    const parsedPath = dynamicPathParser(this.project, entityName, appConfig);

    this.dynamicPath = parsedPath;

    const defaultPrefix = (appConfig && appConfig.prefix) || '';

    let prefix = (this.options.prefix === 'false' || this.options.prefix === '')
                 ? '' : (this.options.prefix || defaultPrefix);
    prefix = prefix && `${prefix}-`;


    this.selector = stringUtils.camelize(prefix + parsedPath.name);
    return parsedPath.name;
  },

  locals: function (options: any) {
    const cliConfig = CliConfig.fromProject();

    options.spec = options.spec !== undefined ?
      options.spec :
      cliConfig && cliConfig.get('defaults.directive.spec');

    options.flat = options.flat !== undefined ?
      options.flat :
      cliConfig && cliConfig.get('defaults.directive.flat');

    return {
      dynamicPath: this.dynamicPath.dir,
      flat: options.flat,
      selector: this.selector
    };
  },

  files: function() {
    let fileList = getFiles.call(this) as Array<string>;

    if (this.options && !this.options.spec) {
      fileList = fileList.filter(p => p.indexOf('__name__.directive.spec.ts') < 0);
    }

    return fileList;
  },

  fileMapTokens: function (options: any) {
    // Return custom template variables here.
    return {
      __path__: () => {
        let dir = this.dynamicPath.dir;
        if (!options.locals.flat) {
          dir += path.sep + options.dasherizedModuleName;
        }
        this.generatePath = dir;
        return dir;
      }
    };
  },

  afterInstall: function(options: any) {
    const returns: Array<any> = [];
    const className = stringUtils.classify(`${options.entity.name}Directive`);
    const fileName = stringUtils.dasherize(`${options.entity.name}.directive`);
    const fullGeneratePath = path.join(this.project.root, this.generatePath);
    const moduleDir = path.parse(this.pathToModule).dir;
    const relativeDir = path.relative(moduleDir, fullGeneratePath);
    const importPath = relativeDir ? `./${relativeDir}/${fileName}` : `./${fileName}`;

    if (!options.skipImport) {
      if (options.dryRun) {
        this._writeStatusToUI(chalk.yellow,
          'update',
          path.relative(this.project.root, this.pathToModule));
        return;
      }
      returns.push(
        astUtils.addDeclarationToModule(this.pathToModule, className, importPath)
          .then((change: any) => change.apply(NodeHost))
          .then((result: any) => {
            if (options.export) {
              return astUtils.addExportToModule(this.pathToModule, className, importPath)
                .then((change: any) => change.apply(NodeHost));
            }
            return result;
          }));
        this._writeStatusToUI(chalk.yellow,
          'update',
          path.relative(this.project.root, this.pathToModule));
    }

    return Promise.all(returns);
  }
});
