// 不直接使用 Cookie 是因为 Cookie 过期时间较短。
// ✅ 但当前 ikuuu 登录流程已变更，账号密码直登会被服务端拒绝（invalid_phase），
//    因此改为「纯 Cookie 直签」模式：只请求 /user/checkin，不再走 /auth/login。

import { appendFileSync } from "fs";

const host = process.env.HOST || "ikuuu.top";

const checkInUrl = `https://${host}/user/checkin`;

// 模拟浏览器请求头
function buildHeaders(refererPath = "/user/checkin") {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Origin: `https://${host}`,
    Referer: `https://${host}${refererPath}`,
  };
}

// 签到
async function checkIn(account) {
  const response = await fetch(checkInUrl, {
    method: "POST",
    headers: {
      ...buildHeaders("/user/checkin"),
      Cookie: account.cookie,
    },
  });

  if (!response.ok) {
    throw new Error(`网络请求出错 - ${response.status}`);
  }

  const data = await response.json();
  console.log(`${account.name}: ${data.msg}`);

  return data.msg;
}

// 处理
async function processSingleAccount(account) {
  if (!account.cookie) {
    throw new Error("缺少 Cookie，请在 ACCOUNTS 中配置 cookie 字段");
  }
  return await checkIn(account);
}

function setGitHubOutput(name, value) {
  // Node.js 24 下显式转换为字符串，避免 appendFileSync 隐式字符串化触发弃用警告
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${name}<<EOF\n${String(value)}\nEOF\n`
  );
}

// 入口
async function main() {
  let accounts;

  try {
    if (!process.env.ACCOUNTS) {
      throw new Error("❌ 未配置账户信息。");
    }

    accounts = JSON.parse(process.env.ACCOUNTS);
  } catch (error) {
    const message = `❌ ${
      error.message.includes("JSON") ? "账户信息配置格式错误。" : error.message
    }`;
    console.error(message);
    setGitHubOutput("result", message);
    process.exit(1);
  }

  const allPromises = accounts.map((account) => processSingleAccount(account));
  const results = await Promise.allSettled(allPromises);

  const msgHeader = "\n======== 签到结果 ========\n\n";
  console.log(msgHeader);

  let hasError = false;

  const resultLines = results.map((result, index) => {
    const accountName = accounts[index].name;

    const isSuccess = result.status === "fulfilled";

    if (!isSuccess) {
      hasError = true;
    }

    const icon = isSuccess ? "✅" : "❌";
    const message = isSuccess ? result.value : result.reason.message;

    const line = `${accountName}: ${icon} ${message}`;

    isSuccess ? console.log(line) : console.error(line);

    return line;
  });

  const resultMsg = resultLines.join("\n");

  setGitHubOutput("result", resultMsg);

  if (hasError) {
    process.exit(1);
  }
}

main();
