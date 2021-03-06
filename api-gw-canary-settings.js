'use strict';

const _ = require('lodash');

class ApiGWCanaryDeploymentCreation {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options
    this.hooks = {
      'before:package:finalize': this.createApiGWCanaryDeployment.bind(this),
    };
  }

  createApiGWCanaryDeployment() {
    let resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;

    let apiMethods = _.filter(resources, ['Type', 'AWS::ApiGateway::Method'])
    apiMethods.forEach(apiMethods => {
      let uri = apiMethods.Properties['Integration']['Uri']
      var idxOfLambdaRef = 0
      let lambdaRef = _.find(uri["Fn::Join"][1], function (e, i) {
        return _.has(e, 'Fn::GetAtt') && (idxOfLambdaRef = i) == i
      })
      let lambdaResourceKey = lambdaRef['Fn::GetAtt'][0]
      let keyToSearch = lambdaResourceKey.replace('Function', '') + 'Version';
      let lambdaVersionResourceKey = _.find(Object.keys(resources), function (key) {
        return key.startsWith(keyToSearch)
      })
      uri["Fn::Join"][1][idxOfLambdaRef] = {
        "Ref": lambdaVersionResourceKey
      }

      this.fillInPermissions(resources, lambdaVersionResourceKey, lambdaResourceKey)
    })

    if (this.options['canaryDeployment'] == "true") {
      this.setupCanarySettings(resources)
    }
  }

  setupCanarySettings(resources) {
    let settings = this.apiGwCanarySettings()
    if (typeof settings == 'undefined') {
      this.serverless.cli.log("Unspecified canary deployment settings, skipping.")
    } else {
      this.serverless.cli.log("Canary deployment with traffic for canary: " + settings['canary']['trafficInPercentages'] + "%")
      _.find(resources, ['Type', 'AWS::ApiGateway::Deployment']).Properties['DeploymentCanarySettings'] = {
        "PercentTraffic": settings['canary']['trafficInPercentages']
      }
    }
  }

  fillInPermissions(resources, lambdaVersionResourceKey, lambdaResourceKey) {
    let keyToSearch = lambdaResourceKey.replace('Function', '') + 'PermissionApiGateway'
    let permissionKey = _.find(Object.keys(resources), function (key) {
      return key.startsWith(keyToSearch)
    })

    let permission = resources[permissionKey]
    permission.Properties['FunctionName'] = {
      "Ref": lambdaVersionResourceKey
    }

    resources[permissionKey]['DeletionPolicy'] = "Retain"

    Object.defineProperty(resources, keyToSearch + this.uuidv4(),
      Object.getOwnPropertyDescriptor(resources, permissionKey));
    delete resources[permissionKey];
  }

  apiGwCanarySettings() {
    return this.serverless.service.custom.apiGatewayDeployment
  }

  uuidv4() {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

module.exports = ApiGWCanaryDeploymentCreation;
