package shared;
/// Skills是什么：用于提示LLM如何完成复杂任务的信息。**其他系统中常用Skills.md文件进行描述，但是本系统并非如此**
///
/// 本系统Skills表示形式：复用已有的[#共识]、[#常识]，用DSL表达业务逻辑
///
/// Skills怎么保存：DSL文件
///
/// Skills保存位置：[Skills位置][./skill]
public class Skills {
    共识 共识;
    常识 常识;
}
