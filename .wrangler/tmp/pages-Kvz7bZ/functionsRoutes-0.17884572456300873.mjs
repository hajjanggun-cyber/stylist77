import { onRequestOptions as __api_analyze_ts_onRequestOptions } from "C:\\Users\\수성길메인\\Desktop\\11  11 실전코딩\\stylist77\\functions\\api\\analyze.ts"
import { onRequestPost as __api_analyze_ts_onRequestPost } from "C:\\Users\\수성길메인\\Desktop\\11  11 실전코딩\\stylist77\\functions\\api\\analyze.ts"
import { onRequestPost as __api_checkout_ts_onRequestPost } from "C:\\Users\\수성길메인\\Desktop\\11  11 실전코딩\\stylist77\\functions\\api\\checkout.ts"
import { onRequestPost as __api_refund_ts_onRequestPost } from "C:\\Users\\수성길메인\\Desktop\\11  11 실전코딩\\stylist77\\functions\\api\\refund.ts"
import { onRequestGet as __api_verify_checkout_ts_onRequestGet } from "C:\\Users\\수성길메인\\Desktop\\11  11 실전코딩\\stylist77\\functions\\api\\verify-checkout.ts"

export const routes = [
    {
      routePath: "/api/analyze",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_analyze_ts_onRequestOptions],
    },
  {
      routePath: "/api/analyze",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_analyze_ts_onRequestPost],
    },
  {
      routePath: "/api/checkout",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_checkout_ts_onRequestPost],
    },
  {
      routePath: "/api/refund",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_refund_ts_onRequestPost],
    },
  {
      routePath: "/api/verify-checkout",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_verify_checkout_ts_onRequestGet],
    },
  ]