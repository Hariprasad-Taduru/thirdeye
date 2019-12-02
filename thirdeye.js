'use strict';
const baseUrl = 'https://api.smartthings.com';
// const baseUrl = process.env.ST_API_URL;

const request = require('request');

exports.handler = (event, context, callback) => {
    console.log('Base URL from config file is: ', baseUrl);
    console.log('Event type is:', event.lifecycle);
    console.log(event);
    try {
        let res;

        switch(event.lifecycle) {
            case 'PING': {
                callback(null, {
                    statusCode: 200,
                    pingData: {
                        challenge: event.pingData.challenge
                    }
                });
                break;
            }
            case 'CONFIGURATION': {
                res = handleConfig(event.configurationData);
                callback(null, {
                    configurationData: res,
                    statusCode: 200
                });
                break;
            }
            case 'INSTALL': {
                handleInstall(event.installData.installedApp, event.installData.authToken);
                callback(null, {
                    installData: {},
                    statusCode: 200
                });
                break;
            }
            case 'UPDATE': {
                handleUpdate(event.updateData.installedApp, event.authToken);
                callback(null, {
                    updateData: {},
                    statusCode: 200
                });
                break;
            }
            case 'UNINSTALL': {
                // Delete subscriptions
                break;
            }
            case 'EVENT': {
                handleEvents(event.eventData);
                callback(null, {
                    eventData: {},
                    statusCode: 200
                });
                break;
            }
            default: {
                callback('Error, execType is not supported: ${event.executionType}');
            }
        }
    } catch (error) {
        callback('Error occurred: ' + error);
    }
};

function handleConfig(event) {
    if (!event.config) {
        throw new Error('No config section set in request.');
    }

    const configurationData = {};
    const phase = event.phase;
    const pageId = event.pageId;
    const settings = event.config;

    switch (phase) {
        case 'INITIALIZE':
            configurationData.initialize = createAppInfo();
            break;
        case 'PAGE':
            configurationData.page = createConfigPage(pageId, settings);
            break;
        default:
            throw new Error('Unsupported config phase: ${phase}');
            break;
    }

    return configurationData;
}

function createAppInfo() {
    return {
        name: 'Third Eye',
        description: 'Smartapp for monitoring intruders.',
        id: 'thirdeye',
        permissions: ['r:devices:*', 'x:devices:*', 'w:devices:*', 'r:locations:*'],
        firstPageId: '1'
    }
}

function createConfigPage(pageId, currentConfig) {
    if (pageId !== '1') {
        throw new Error('Unsupported page name: ${pageId}');
    }

    return {
        pageId: '1',
        name: 'Third Eye',
        nextPageId: null,
        previousPageId: null,
        complete: true,
        sections: [
            {
                name: 'Turn on when there\'s movement...',
                settings: [
                    {
                        id: 'motion1', // ID of this field
                        name: 'Select a motion sensor',
                        description: 'Tap to set',
                        type: 'DEVICE',
                        required: true,
                        multiple: false,
                        capabilities: ['motionSensor'],
                        permissions: ['r']
                    }
                ]
            },
            {
                name: 'Turn on below light',
                settings: [
                    {
                        id: 'switches', // ID of this field
                        name: 'Select a light',
                        description: 'Tap to set',
                        type: 'DEVICE',
                        required: true,
                        multiple: false,
                        capabilities: ['switch', 'actuator'],
                        permissions: ['r', 'x']
                    }
                ]
            }
        ]
    };
}

function handleInstall(installedApp, authCode) {
   const path = '/installedapps/' + installedApp.installedAppId + '/subscriptions';
   
   let subRequest = {
        sourceType: 'DEVICE',
        device: {
            componentId: installedApp.config.motion1[0].deviceConfig.componentId,
            deviceId: installedApp.config.motion1[0].deviceConfig.deviceId,
            capability: 'motionSensor',
            attribute: 'motion',
            stateChangeOnly: true,
            value: '*'
        }
    };

    console.log('subscribeToMotion:', [installedApp.installedAppId, installedApp.config, authCode, path]);

    request.post({
        url: baseUrl + path,
        json: true,
        body: subRequest,
        headers: {
            'Authorization': 'Bearer ' + authCode,
        }
    },function (error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log('Thirdeye subscriptions successful.')
        } else {
            console.log('Third subscriptions failed.');
            console.log(error);
        }
    });

}

function handleUpdate(installedApp, authToken) {
    const path = '/locations/${installedApp.locationId}/installedapps/${installedApp.installedAppId}/subscriptions';

    request.delete({
        url: baseUrl + path,
        headers: {
            'Authorization': 'Bearer ' + authToken
        }
    }, function () {
        handleInstall(installedApp, authToken);
    });
}

function handleEvents(eventData) {
    const eventType = eventData.events[0].eventType;
    if ('DEVICE_EVENT' === eventType) {
        console.log(eventData.events[0].deviceEvent);
        motionHandler(eventData.installedApp.installedAppId, eventData.events[0].deviceEvent, eventData.installedApp.config, eventData.authToken);
    }
}

function motionHandler(installedAppId, deviceEvent, config, authToken) {
    if (deviceEvent.deviceId === config.motion1[0].deviceConfig.deviceId) {
        if (deviceEvent.value === 'active') {
            console.log('turning on lights');
            actuateLight(config.switches[0].deviceConfig.deviceId, 'on', authToken);
        } else if (deviceEvent.value === 'inactive') {
            actuateLight(config.switches[0].deviceConfig.deviceId, 'off', authToken);
        }
    }
}

function actuateLight(deviceId, status, authToken) {
    const path = '/devices/' + deviceId + '/commands';
    const deviceRequest = {
        component: 'main',
        capability: 'switch',
        command: status,
        arguments: []
    };

    console.log('Actuate Light:', [path, deviceRequest]);

    request.post({
        url: baseUrl + path,
        json: true,
        body: [deviceRequest],
        headers: {
            'Authorization': 'Bearer ' + authToken
        }
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            console.log('this worked')
        }
    });
}

