import React from "react";

export default function BrandMark({ className, size = 35 }) {
  return <img src={`${process.env.PUBLIC_URL || ""}/logo192.png`} alt="" width={size} height={size} className={className} />;
}
