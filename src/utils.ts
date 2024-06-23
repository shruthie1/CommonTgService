import  axios from 'axios';
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
export function contains(str, arr) {
  return (arr.some(element => {
      if (str?.includes(element)) {
          return true;
      }
      return false;
  }))
};
export async function fetchWithTimeout(resource, options : any= {}, maxRetries = 3) {
  const timeout = options?.timeout || 15000;

  const source = axios.CancelToken.source();
  const id = setTimeout(() => source.cancel(), timeout);
  for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
    try {
      const response = await axios({
        ...options,
        url: resource,
        cancelToken: source.token
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      console.log("error at URL: ", resource);
      parseError(error)
      if (axios.isCancel(error)) {
        console.log('Request canceled:', error.message, resource);
      } 
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 1 second delay
      } else {
        console.error(`All ${maxRetries + 1} retries failed for ${resource}`);
        return undefined;
      }
    }
  }
}

export function fetchNumbersFromString(inputString) {
  const regex = /\d+/g;
  const matches = inputString.match(regex);
  if (matches) {
    const result = matches.join('');
    return result;
  } else {
    return '';
  }
}

export function parseError(
  err,
  prefix = 'TgCms',
) {
  let status = 'UNKNOWN';
  let message = 'An unknown error occurred';
  let error = 'UnknownError';

  const extractMessage = (data) => {
    if (Array.isArray(data)) {
      const messages = data.map((item) => extractMessage(item));
      return messages.filter((message) => message !== undefined).join(', ');
    } else if (typeof data === 'string') {
      return data;
    } else if (typeof data === 'object' && data !== null) {
      let resultString = ''
      for (const key in data) {
        const value = data[key]
        if (Array.isArray(data[key]) && data[key].every(item => typeof item === 'string')) {
          resultString = resultString + data[key].join(', ');
        } else {
          const result = extractMessage(value);
          if (result) {
            resultString = resultString + result;
          }
        }
      }
      return resultString
    }
    return JSON.stringify(data);
  };

  if (err.response) {
    const response = err.response;
    status =
      response.data?.status ||
      response.status ||
      err.status ||
      'UNKNOWN';
    message =
      response.data?.message ||
      response.data?.errors ||
      response.message ||
      response.statusText ||
      response.data ||
      err.message ||
      'An error occurred';
    error =
      response.data?.error ||
      response.error ||
      err.name ||
      err.code ||
      'Error';
  } else if (err.request) {
    status = err.status || 'NO_RESPONSE';
    message = err.data?.message ||
      err.data?.errors ||
      err.message ||
      err.statusText ||
      err.data ||
      err.message || 'The request was triggered but no response was received';
    error = err.name || err.code || 'NoResponseError';
  } else if (err.message) {
    status = err.status || 'UNKNOWN';
    message = err.message;
    error = err.name || err.code || 'Error';
  }

  const msg = `${prefix ? `${prefix} ::` : ""} ${extractMessage(message)} `

  const resp = { status, message: msg, error };
  console.log(resp);
  return resp
}

let botCount = 0
export const ppplbot = () => {
  let token;
  if (botCount % 2 == 1) {
    token = `bot6624618034:AAHoM3GYaw3_uRadOWYzT7c2OEp6a7A61mY`
  } else {
    token = `bot6607225097:AAG6DJg9Ll5XVxy24Nr449LTZgRb5bgshUA`
  }

  return `https://api.telegram.org/${token}/sendMessage?chat_id=-1001801844217`
}