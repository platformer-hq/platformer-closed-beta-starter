import { retrieveRawInitData } from '@telegram-apps/bridge';
import { date, looseObject, pipe, string, transform } from 'valibot';

import { gqlRequest, type GqlRequestError } from './helpers/gqlRequest.ts';

function extractErrorMessage(error: GqlRequestError): string {
  if (error[0] === 'http') {
    return `Request failed with status ${error[1]}: ${error[2]}`;
  }
  if (error[0] === 'fetch') {
    return `Request failed: ${error[1].message}`;
  }
  if (error[0] === 'invalid-data') {
    return `Unexpected response received: ${error[1].message}`;
  }
  return `Server returned GraphQL errors: ${
    error[1]
      .map(e => `${e.code}${e.message ? ` (${e.message})` : ''}`)
      .join(', ')
  }`;
}

(async () => {
  const title = document.getElementById('title')!;
  const apiBaseURL = 'https://mini-apps.store/gql';

  const authTokenResponse = await gqlRequest(
    apiBaseURL,
    'mutation Authenticate($initData: String!) {'
    + ' authenticateTelegram(initData: $initData) {'
    + '  token'
    + '  expiresAt'
    + ' }'
    + '}',
    { initData: retrieveRawInitData()! },
    looseObject({
      authenticateTelegram: looseObject({
        token: string(),
        expiresAt: pipe(
          string(),
          transform((v) => new Date(v)),
          date(),
        ),
      }),
    }),
  );
  if (!authTokenResponse[0]) {
    title.innerText = extractErrorMessage(authTokenResponse[1]);
    return;
  }

  const { token } = authTokenResponse[1].authenticateTelegram;
  const checkAccessResponse = await gqlRequest(
    apiBaseURL,
    'query CheckAccess {'
    + ' currentUser {'
    + '  apps { role }'
    + ' }'
    + '}',
    {},
    looseObject({}),
    { authToken: token },
  );
  if (!checkAccessResponse[0]) {
    const [, error] = checkAccessResponse;
    let errorText: string;
    if (error[0] === 'gql' && error[1].some(v => v.code === 'ERR_NOT_ALLOWED')) {
      errorText = 'You are not recognized as a beta tester';
    } else {
      errorText = extractErrorMessage(error);
    }
    title.innerText = errorText;
    return;
  }

  title.innerText = `Your access token:`;
  document.getElementById('token')!.innerText = token;
})();