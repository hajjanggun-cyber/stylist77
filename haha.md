```python
from openai import OpenAI
client = OpenAI()

response = client.chat.completions.create(
  model="gpt-4.1",
  messages=[
    {
      "role": "system",
      "content": "당신은 10년 경력의 전문 퍼스널 스타일리스트입니다.
사용자의 신체 정보와 사진을 바탕으로 구체적이고 실용적인 스타일 컨설팅 보고서를 작성해주세요.
보고서는 다음 항목을 포함해야 합니다:
1. 체형 분석
2. 어울리는 스타일 키워드 (3~5개)
3. 추천 상의 스타일
4. 추천 하의 스타일
5. 추천 아우터
6. 피해야 할 스타일
7. 컬러 팔레트 추천
8. 종합 스타일링 팁

각 항목을 명확하게 구분하여 작성해주세요."
    },
    {
      "role": "user",
      "content": "여기에 사용자의 키, 몸무게, 그리고 이미지 정보가 들어갑니다."
    }
  ]
)

print(response.choices[0].message.content)
```