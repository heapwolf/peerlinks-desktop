import Network from './network';

export const NETWORK_READY = 'NETWORK_READY';
export const NETWORK_LOADING = 'NETWORK_LOADING';
export const NETWORK_ERROR = 'NETWORK_ERROR';

export const NEW_CHANNEL_CREATED = 'NEW_CHANNEL_CREATED';
export const NEW_CHANNEL_RESET = 'NEW_CHANNEL_RESET';
export const NEW_CHANNEL_IN_PROGRESS = 'NEW_CHANNEL_IN_PROGRESS';
export const NEW_CHANNEL_ERROR = 'NEW_CHANNEL_ERROR';

export const INVITE_REQUEST_GENERATING = 'INVITE_REQUEST_GENERATING';
export const INVITE_REQUEST_WAITING = 'INVITE_REQUEST_WAITING';
export const INVITE_REQUEST_SET_IDENTITY_KEY =
  'INVITE_REQUEST_SET_IDENTITY_KEY';
export const INVITE_REQUEST_SET_REQUEST = 'INVITE_REQUEST_SET_REQUEST';
export const INVITE_REQUEST_GOT_CHANNEL = 'INVITE_REQUEST_GOT_CHANNEL';
export const INVITE_REQUEST_RESET = 'INVITE_REQUEST_RESET';

export const ADD_NOTIFICATION = 'ADD_NOTIFICATION';
export const REMOVE_NOTIFICATION = 'REMOVE_NOTIFICATION';

export const ADD_IDENTITY = 'ADD_IDENTITY';
export const IDENTITY_ADD_CHANNEL = 'IDENTITY_ADD_CHANNEL';

export const ADD_CHANNEL = 'ADD_CHANNEL';
export const APPEND_CHANNEL_MESSAGE = 'APPEND_CHANNEL_MESSAGE';
export const TRIM_CHANNEL_MESSAGES = 'TRIM_MESSAGES';
export const CHANNEL_SET_MESSAGE_COUNT = 'CHANNEL_SET_MESSAGE_COUNT';
export const CHANNEL_MARK_READ = 'CHANNEL_MARK_READ';

const network = new Network();

//
// network
//

export function networkReady() {
  return { type: NETWORK_READY };
}

export function networkLoading() {
  return { type: NETWORK_LOADING };
}

export function networkError(error) {
  return { type: NETWORK_ERROR, error };
}

export function initNetwork({ passphrase }) {
  const init = async (dispatch) => {
    await network.init({ passphrase });

    const channels = await network.getChannels();
    for (const channel of channels) {
      dispatch(addChannel(channel));
    }

    const identities = await network.getIdentities();
    for (const identity of identities) {
      dispatch(addIdentity(identity));
    }
  };

  return (dispatch) => {
    dispatch(networkLoading());
    init(dispatch).then(() => {
      dispatch(networkReady());
    }).catch((e) => {
      dispatch(networkError(e));
    });
  };
}

//
// new channel
//

export function newChannelCreated({ channelId }) {
  return { type: NEW_CHANNEL_CREATED, channelId };
}

export function newChannelReset() {
  return { type: NEW_CHANNEL_RESET };
}

export function newChannelInProgress() {
  return { type: NEW_CHANNEL_IN_PROGRESS };
}

export function newChannelError(error) {
  return { type: NEW_CHANNEL_ERROR, error };
}

export function newChannel({ channelName }) {
  const createChannel = async (dispatch) => {
    const { identity, channel } = await network.createIdentityPair({
      name: channelName,
    });

    dispatch(addChannel(channel));
    dispatch(addIdentity(identity));

    return channel.id;
  };

  return (dispatch) => {
    dispatch(newChannelInProgress());
    createChannel(dispatch).then((channelId) => {
      dispatch(newChannelCreated({ channelId }));
    }).catch((e) => {
      dispatch(newChannelError(e));
    });
  };
}

export function requestInvite({ identityKey }) {
  const generate = async (dispatch) => {
    return await network.requestInvite({ identityKey });
  };

  return (dispatch) => {
    dispatch({ type: INVITE_REQUEST_GENERATING });
    generate(dispatch).then((request) => {
      dispatch({
        type: INVITE_REQUEST_SET_REQUEST,
        identityKey,
        request,
      });
    }).catch((e) => {
      dispatch(newChannelError(e));
    });
  };
}

export function waitForInvite({ identityKey }) {
  const wait = async (dispatch) => {
    return await network.waitForInvite({ identityKey });
  };

  return (dispatch) => {
    dispatch({ type: INVITE_REQUEST_WAITING });
    wait(dispatch).then((channel) => {
      // Allow posting to this channel
      dispatch({
        type: IDENTITY_ADD_CHANNEL,
        identityKey,
        channelId: channel.id,
      });
      dispatch(addChannel(channel));
      dispatch({ type: INVITE_REQUEST_GOT_CHANNEL, channel });
    }).catch((e) => {
      dispatch(newChannelError(e));
    });
  };
}

export function inviteRequestReset() {
  return { type: INVITE_REQUEST_RESET };
}

//
// notifications
//

export function addNotification({ kind, content }) {
  return { type: ADD_NOTIFICATION, kind, content };
}

export function removeNotification({ notificationId }) {
  return { type: REMOVE_NOTIFICATION, notificationId };
}

//
// identities
//

export function addIdentity(identity) {
  return { type: ADD_IDENTITY, identity };
}

//
// channels
//

export function addChannel(channel) {
  return (dispatch) => {
    dispatch({ type: ADD_CHANNEL, channel });

    const loop = () => {
      network.waitForIncomingMessage({ channelId: channel.id }).then(() => {
        dispatch(updateMessageCount({ channelId: channel.id }));
        dispatch(loadMessages({ channelId: channel.id }));
        loop();
      }).catch((e) => {
        dispatch(addNotification({
          kind: 'error',
          content: 'Failed to wait for an update: ' + e.message,
        }));
      });
    };
    loop();
  };
}

export function appendChannelMessage({ channelId, message, isPosted = false }) {
  return { type: APPEND_CHANNEL_MESSAGE, channelId, message, isPosted };
}

export function trimChannelMessages({ channelId, count }) {
  return { type: TRIM_CHANNEL_MESSAGES, channelId, count };
}

export function updateMessageCount({ channelId }) {
  const update = async (dispatch) => {
    const messageCount = await network.getMessageCount({ channelId });
    dispatch({ type: CHANNEL_SET_MESSAGE_COUNT, channelId, messageCount });
  };

  return (dispatch) => {
    update(dispatch).catch((e) => {
      dispatch(addNotification({
        kind: 'error',
        content: 'Failed to update message count: ' + e.message,
      }));
    });
  };
}

export function channelMarkRead({ channelId }) {
  return { type: CHANNEL_MARK_READ, channelId };
}

export const DEFAULT_LOAD_LIMIT = 1024;

export function loadMessages(options) {
  const { channelId, offset = 0, limit = DEFAULT_LOAD_LIMIT } = options;
  const load = async (dispatch) => {
    const messages = await network.getReverseMessagesAtOffset({
      channelId,
      offset,
      limit,
    });

    for (const message of messages) {
      dispatch(appendChannelMessage({ channelId, message }));
    }
  };

  return (dispatch) => {
    load(dispatch).catch((e) => {
      dispatch(addNotification({
        kind: 'error',
        content: 'Failed to load messages: ' + e.message,
      }));
    });
  };
}

export function invite(params) {
  const run = async (dispatch) => {
    await network.invite(params);
  };

  return (dispatch) => {
    run(dispatch).then((e) => {
      dispatch(addNotification({
        kind: 'info',
        content: `Invited "${params.inviteeName}" to the channel`,
      }));
    }).catch((e) => {
      dispatch(addNotification({
        kind: 'error',
        content: `Failed to invite "${params.inviteeName}": ` + e.message,
      }));
    });
  };
}

const COMMANDS = new Map([
  [
    'invite',
    { args: [ 'inviteeName', 'requestId', 'request' ], action: invite },
  ],
]);

export function postMessage({ channelId, identityKey, text }) {
  // Execute commands
  async function runCommand(dispatch, { channelId, identityKey, text }) {
    const parts = text.trim().split(/\s+/g);

    const commandName = parts.shift().slice(1);
    const args = parts;

    if (!COMMANDS.has(commandName)) {
      throw new Error(`Unknown command: /${commandName}`);
    }

    const command = COMMANDS.get(commandName);
    if (command.args.length !== args.length) {
      throw new Error('Invalid command arguments. ' +
        `Expected: /${commandName} ${command.args.join(' ')}`);
    }

    const params = Object.create(null);
    params.channelId = channelId;
    params.identityKey = identityKey;
    for (const [ i, arg ] of args.entries()) {
      params[command.args[i]] = arg;
    }

    dispatch(command.action(params));
  }

  const post = async (dispatch) => {
    if (text.startsWith('/')) {
      return await runCommand(dispatch, { channelId, identityKey, text });
    }

    const message = await network.postMessage({
      channelId,
      identityKey,
      json: { text },
    });

    dispatch(appendChannelMessage({ channelId, message, isPosted: true }));
  };

  return (dispatch) => {
    post(dispatch).catch((e) => {
      dispatch(addNotification({
        kind: 'error',
        content: 'Failed to post message: ' + e.message,
      }));
    });
  };
}
