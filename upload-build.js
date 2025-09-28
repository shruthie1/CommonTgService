const cloudinary = require('cloudinary');

async function overwriteFile(branch) {
  const localFilePath = `./out/index.js`; // Assuming the file is in the 'src' directory
  cloudinary.v2.config({
    cloud_name: process.env.CL_NAME,
    api_key: process.env.CL_APIKEY,
    api_secret: process.env.CL_APISECRET,
  });

  try {
    const result = await cloudinary.v2.uploader.upload(localFilePath, {
      resource_type: 'auto',
      overwrite: true,
      invalidate: true,
      public_id: `cts-${branch}.js`,
    });

    console.log(result);

    const url = `https://ums.paidgirl.site/builds`;
    const bodyData = {
      cts: `https://res.cloudinary.com/${process.env.CL_NAME}/raw/upload/v${result.version}/${result.public_id}`,
    };

    const resp = await fetch(url, {
      method: 'PATCH',
      body: JSON.stringify(bodyData),
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.API_KEY || 'santoor',
      },
    });

    if (!resp.ok) {
      throw new Error(`Request failed: ${resp.status} ${resp.statusText}`);
    }

    console.log(await resp.json());
  } catch (error) {
    console.error(error);
  }
}

const branchName = process.argv[2];
overwriteFile(branchName);
